const localVideo = document.getElementById('local_video');
const remoteVideo = document.getElementById('remote_video');
const textForSendSdp = document.getElementById('text_for_send_sdp');
const textToReceiveSdp = document.getElementById('text_for_receive_sdp');
let localStream = null;
let peerConnection = null;

// getUserMediaでカメラ、マイクにアクセス
function startVideo() {
    // 映像と音声双方を取得
    // 映像はサイズの指定可能
    // { audio: true, video: { width: {min: 640, max: 640}, height: {min: 480, max: 480} } }
    navigator.mediaDevices.getUserMedia({video: true, audio: true})
        .then(function (stream) { // success
            playVideo(localVideo,stream);
            localStream = stream;
        }).catch(function (error) { // error
        console.error('mediaDevice.getUserMedia() error:', error);
        return;
    });
}

// Videoの再生を開始する(2行でよい)
function playVideo(element, stream) {
    element.srcObject = stream;
    element.play();
}

// WebRTCを利用する準備をする
function prepareNewConnection() {
    // RTCPeerConnectionを初期化する
    // 国内のskywayというSTUNサーバを指定(無料)
    // TURNサーバはpc_configに追加する(通信が流れるので有料)
    const pc_config = {"iceServers":[ {"urls":"stun:stun.skyway.io:3478"} ]};
    const peer = new RTCPeerConnection(pc_config);

    // リモートのストリームを受信した場合のイベントをセット
    if ('ontrack' in peer) {
        // Firefox向け(W3Cに沿う)
        peer.ontrack = function(event) {
            console.log('-- peer.ontrack()');
            // 配列streamsに相手の映像が入ってくる。それをHTMLの指定タグに渡す
            playVideo(remoteVideo, event.streams[0]);
        };
    }
    else {
        // Chrome向け
        peer.onaddstream = function(event) {
            console.log('-- peer.onaddstream()');
            playVideo(remoteVideo, event.stream);
        };
    }

    // ICE Candidateを収集したときのイベント(Vanilla ICE)
    // peer.onicecandidate = function (evt) {
    //     if (evt.candidate) {
    //         // Vanilla ICEの場合は何もしない
    //         console.log(evt.candidate);
    //     } else {
    //         // 候補の収集完了(evtの中にcandidateが入ってこなくなった)
    //         console.log('empty ice event');
    //         sendSdp(peer.localDescription);
    //     }
    // };

    // Trickle ICEの場合
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            // Trickle ICE の場合は、ICE candidateを相手に送る
            console.log(evt.candidate);
            sendIceCandidate(evt.candidate);
        } else {
            // Trickle ICEの場合は何もしない
            console.log('empty ice event');
        }
    };

    // ICEのステータスが変更になったときの処理
    peer.oniceconnectionstatechange = function() {
        console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
        switch (peer.iceConnectionState) {
            case 'closed':
            case 'failed':
                // ICEのステートが切断状態または異常状態になったら切断処理を実行する
                // 再度Offerを送ってもらうしかない状況
                if (peerConnection) {
                    hangUp();
                }
                break;
            case 'disconnected':
                // disconnectedはブラウザ側で再接続を試みる
                break;
        }
    };

    // ローカルのストリームを利用できるように準備する
    if (localStream) {
        console.log('Adding local stream...');
        peer.addStream(localStream);
    }
    else {
        console.warn('no local stream, but continue.');
    }

    return peer;
}

// 手動シグナリングのための処理を追加する
function sendSdp(sessionDescription) {
    console.log('---sending sdp ---');
    textForSendSdp.value = sessionDescription.sdp;
    // 手動シグナリングでコピペしやすいように
    // textForSendSdp.focus();
    // textForSendSdp.select();
    // 画面上に表示しつつ、wsで相手に送る
    const message = JSON.stringify(sessionDescription);
    console.log('sending SDP=' + message);
    ws.send(message);
}

// Connectボタンが押されたら処理を開始
function connect() {
    if (! peerConnection) {
        console.log('make Offer');
        makeOffer();
    }
    else {
        console.warn('peer already exist.');
    }
}

// Offer SDP(自分が通信に使える情報、コーデックなど)を生成する
function makeOffer() {
    peerConnection = prepareNewConnection();
    // Firefoxではonnegotiationneededが発火しない
    peerConnection.onnegotiationneeded = function(){
        // promise形式
        peerConnection.createOffer()
            .then(function (sessionDescription) {
                console.log('createOffer() succsess in promise');
                // createOfferで返ってきたSDPを編集せずに渡す
                // 例えば自分自身が使えるコーデックから一つに編集して相手に送ることもある
                return peerConnection.setLocalDescription(sessionDescription);
            }).then(function() {
                console.log('setLocalDescription() succsess in promise');
                // Trikle ICE対応用(1つ上のthenでセットした自分のSDPを相手に送る)
                sendSdp(peerConnection.localDescription);
        }).catch(function(err) {
            console.error(err);
        });
    }
}

// Answer SDPを生成する
function makeAnswer() {
    console.log('sending Answer. Creating remote session description...' );
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.createAnswer()
        .then(function (sessionDescription) {
            // createAnswerで返ってきたSDP
            console.log('createAnswer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(function() {
            console.log('setLocalDescription() succsess in promise');
            // Trikle ICE対応用(1つ上のthenでセットした自分のSDPを相手に送る)
            sendSdp(peerConnection.localDescription);
    }).catch(function(err) {
        console.error(err);
    });
}

// SDPのタイプ(Offer/Answer)を判別しセットする
// Offer側:Offerを自分で生成して送る/Answer側:相手から来たOfferを自分で設定する
function onSdpText() {
    const text = textToReceiveSdp.value;
    if (peerConnection) {
        // Offerした側が相手からのAnswerをセットする場合
        console.log('Received answer text...');
        const answer = new RTCSessionDescription({
            type : 'answer',
            sdp : text,
        });
        setAnswer(answer);
    }
    else {
        // Offerを受けた側(Answer側)が相手からのOfferをセットする場合
        console.log('Received offer text...');
        const offer = new RTCSessionDescription({
            type : 'offer',
            sdp : text,
        });
        setOffer(offer);
    }
    textToReceiveSdp.value ='';
}

// Offer側のSDPをセットした場合の処理
function setOffer(sessionDescription) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    // Answerは突然来るので初期処理が必要
    peerConnection = prepareNewConnection();
    peerConnection.onnegotiationneeded = function () {
        peerConnection.setRemoteDescription(sessionDescription)
            .then(function() {
                console.log('setRemoteDescription(offer) succsess in promise');
                // OfferをセットしたのでAnswwerを作る
                makeAnswer();
            }).catch(function(err) {
                console.error('setRemoteDescription(offer) ERROR: ', err);
        });
    }
}

// Answer側のSDPをセットした場合の処理(Offerを出した側にAnswerが返ってきた)
function setAnswer(sessionDescription) {
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(answer) succsess in promise');
        }).catch(function(err) {
            console.error('setRemoteDescription(answer) ERROR: ', err);
    });
}

// P2P通信を切断する
// 一方が切った場合は他方には映像が残る(電話のように両者が即時切断されない)
function hangUp(){
    if (peerConnection) {
        if(peerConnection.iceConnectionState !== 'closed'){
            peerConnection.close();
            peerConnection = null;
            const message = JSON.stringify({ type: 'close' });
            console.log('sending close message');
            ws.send(message);
            cleanupVideoElement(remoteVideo);
            textForSendSdp.value = '';
            textToReceiveSdp.value = '';
            return;
        }
    }
    console.log('peerConnection is closed.');

}

// ビデオエレメントを初期化する
function cleanupVideoElement(element) {
    element.pause();
    element.srcObject = null;
}

// シグナリングサーバへ接続する
// シグナリングサーバへ接続する
const wsUrl = 'ws://localhost:3001/';
const ws = new WebSocket(wsUrl);
// WebSocketサーバと接続確立
ws.onopen = function(evt) {
    console.log('ws open()');
};
// WebSocketサーバと接続確立できなかった
ws.onerror = function(err) {
    console.error('ws onerror() ERR:', err);
};
// シグナリングサーバからメッセージを受信した場合(Offerを受けたらOfferを設定/Offerを投げたらAnswerを受信/Candidateの場合)
ws.onmessage = function(evt) {
    console.log('ws onmessage() data:', evt.data);
    const message = JSON.parse(evt.data);
    if (message.type === 'offer') {
        // offer 受信時
        console.log('Received offer ...');
        textToReceiveSdp.value = message.sdp;
        const offer = new RTCSessionDescription(message);
        setOffer(offer);
    }
    else if (message.type === 'answer') {
        // answer 受信時
        console.log('Received answer ...');
        textToReceiveSdp.value = message.sdp;
        const answer = new RTCSessionDescription(message);
        setAnswer(answer);
    }
    else if (message.type === 'candidate') {
        // ICE candidate 受信時
        console.log('Received ICE candidate ...');
        const candidate = new RTCIceCandidate(message.ice);
        console.log(candidate);
        addIceCandidate(candidate);
    }
    else if (message.type === 'close') {
        // closeメッセージ受信時
        console.log('peer is closed ...');
        hangUp();
    }
};

// ICE candaidate受信時にセットする
function addIceCandidate(candidate) {
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// ICE candidate生成時に送信する
function sendIceCandidate(candidate) {
    console.log('---sending ICE candidate ---');
    const message = JSON.stringify({ type: 'candidate', ice: candidate });
    console.log('sending candidate=' + message);
    ws.send(message);
}
