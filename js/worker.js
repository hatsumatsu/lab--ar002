importScripts('artoolkitNft.min.js');

self.onmessage = e => {
    let msg = e.data;
    switch (msg.type) {
        case "load": {
            load(msg);
            return;
        }
        case "process": {
            next = msg.imagedata;
            process();
            return;
        }
    }
};

let next = null;

let ar = null;
let markerResult = null;

function load(msg) {
    let param = new ARCameraParam('https://s3-us-west-2.amazonaws.com/s.cdpn.io/181962/camera_para-iPhone%205%20rear%20640x480%201.0m.dat');
    param.onload = function () {
        ar = new ARController(msg.pw, msg.ph, param);
        let cameraMatrix = ar.getCameraMatrix();

        ar.addEventListener('getNFTMarker', function (ev) {
            markerResult = {type: "found", matrixGL_RH: JSON.stringify(ev.data.matrixGL_RH), proj: JSON.stringify(cameraMatrix)};
        });

        ar.loadNFTMarker(msg.marker, function (markerId) {
            ar.trackNFTMarkerId(markerId, 2);
            console.log("loadNFTMarker -> ", markerId);
        });

        postMessage({type: "loaded", proj: JSON.stringify(cameraMatrix)});
    };
}

function process() {

    markerResult = null;

    if (ar) {
        ar.process(next);
    }

    if (markerResult) {
        postMessage(markerResult);
    } else {
        postMessage({type: "not found"});
    }

    next = null;
}