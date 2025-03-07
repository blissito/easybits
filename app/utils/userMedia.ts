export const permittedGetUserMedia = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export function processStream(stream: MediaStream, mediaSource: MediaSource) {
  const mediaRecorder = new MediaRecorder(stream);
  const videoBuffer = mediaSource.addSourceBuffer("video/webm;codecs=vp8");

  mediaRecorder.ondataavailable = (data) => {
    let fileReader = new FileReader();
    let arrayBuffer;

    fileReader.onloadend = () => {
      arrayBuffer = fileReader.result as ArrayBuffer;
      videoBuffer.appendBuffer(arrayBuffer);
    };
    fileReader.readAsArrayBuffer(data.data);
  };
  mediaRecorder.start();

  setInterval(() => {
    mediaRecorder.requestData();
  }, 1000);
}

export function registerRecord(stream: MediaStream) {
  const mediaRecorder = new MediaRecorder(stream);
  let countUploadChunk = 0;

  mediaRecorder.ondataavailable = (data) => {
    console.info(data.data, countUploadChunk);
    countUploadChunk++;
  };
  mediaRecorder.start();

  setInterval(() => {
    mediaRecorder.requestData();
  }, 2000);
}
