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
