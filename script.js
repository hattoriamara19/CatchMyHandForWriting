/* =========================================================
   AIR PEN WRITING V8.1
   LOCAL OPENCV.JS
   TRUE 4-POINT PERSPECTIVE CALIBRATION
   ========================================================= */


/* =========================================================
   GET HTML ELEMENTS
========================================================= */

const video =
    document.getElementById("camera");

const overlayCanvas =
    document.getElementById(
        "overlayCanvas"
    );

const processingCanvas =
    document.getElementById(
        "processingCanvas"
    );

const drawingCanvas =
    document.getElementById(
        "drawingCanvas"
    );

const detectedDot =
    document.getElementById(
        "detectedDot"
    );

const cameraMessage =
    document.getElementById(
        "cameraMessage"
    );

const status =
    document.getElementById(
        "status"
    );

const cameraMode =
    document.getElementById(
        "cameraMode"
    );


const startBtn =
    document.getElementById(
        "startBtn"
    );

const calibrateBtn =
    document.getElementById(
        "calibrateBtn"
    );

const switchBtn =
    document.getElementById(
        "switchBtn"
    );

const stopBtn =
    document.getElementById(
        "stopBtn"
    );

const undoBtn =
    document.getElementById(
        "undoBtn"
    );

const clearBtn =
    document.getElementById(
        "clearBtn"
    );

const saveBtn =
    document.getElementById(
        "saveBtn"
    );


/* =========================================================
   CONTEXTS
========================================================= */

const overlayCtx =
    overlayCanvas.getContext(
        "2d"
    );

const processingCtx =
    processingCanvas.getContext(
        "2d"
    );

const drawingCtx =
    drawingCanvas.getContext(
        "2d"
    );


/* =========================================================
   OPENCV
========================================================= */

let cvReady = false;


/* =========================================================
   CAMERA
========================================================= */

let cameraStream = null;

let cameraFacing = "user";

let cameraRunning = false;

let animationId = null;


/* =========================================================
   PEN TRACKING
========================================================= */

let smoothX = null;

let smoothY = null;

const SMOOTHING = 0.30;


/* =========================================================
   COLOR DETECTION
========================================================= */

/*
   HSV range for bright green/yellow marker.
*/

const LOWER_H = 15;

const LOWER_S = 100;

const LOWER_V = 100;


const UPPER_H = 95;

const UPPER_S = 255;

const UPPER_V = 255;


/* =========================================================
   CALIBRATION
========================================================= */

let calibrationActive = false;

let calibrationPoints = [];

let calibrationIndex = 0;

let perspectiveMatrix = null;


const calibrationNames = [

    "TOP-LEFT",

    "TOP-RIGHT",

    "BOTTOM-RIGHT",

    "BOTTOM-LEFT"

];


/* =========================================================
   PEN-UP ZONE
========================================================= */

const PEN_UP_ZONE = {

    x: 0.10,

    y: 0.10,

    radius: 0.10

};


let writingEnabled = false;


/* =========================================================
   STROKES
========================================================= */

let strokes = [];

let currentStroke = [];

let lastDrawX = null;

let lastDrawY = null;


/* =========================================================
   OPENCV LOADING
========================================================= */

function waitForOpenCV() {

    if (
        typeof cv !== "undefined" &&
        cv.Mat
    ) {

        cvReady = true;

        status.textContent =
            "✅ OpenCV loaded. Press Start Camera.";

        console.log(
            "OpenCV loaded successfully."
        );

        return;
    }


    status.textContent =
        "⏳ Loading OpenCV...";


    setTimeout(
        waitForOpenCV,
        500
    );
}


waitForOpenCV();


/* =========================================================
   RESIZE
========================================================= */

function resizeCanvases() {

    const overlayRect =
        overlayCanvas.getBoundingClientRect();


    overlayCanvas.width =
        Math.max(
            1,
            Math.floor(
                overlayRect.width
            )
        );


    overlayCanvas.height =
        Math.max(
            1,
            Math.floor(
                overlayRect.height
            )
        );


    const drawingRect =
        drawingCanvas.getBoundingClientRect();


    drawingCanvas.width =
        Math.max(
            1,
            Math.floor(
                drawingRect.width
            )
        );


    drawingCanvas.height =
        Math.max(
            1,
            Math.floor(
                drawingRect.height
            )
        );


    drawingCtx.lineCap =
        "round";


    drawingCtx.lineJoin =
        "round";


    redrawAllStrokes();


    if (
        cameraRunning &&
        !calibrationActive
    ) {

        drawNormalOverlay();
    }
}


window.addEventListener(
    "resize",
    resizeCanvases
);


setTimeout(
    resizeCanvases,
    500
);


/* =========================================================
   START CAMERA
========================================================= */

async function startCamera() {

    if (!cvReady) {

        status.textContent =
            "OpenCV is not loaded yet.";

        return;
    }


    await stopCamera();


    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        status.textContent =
            "Camera API is unavailable. Use HTTPS or localhost.";

        return;
    }


    try {

        cameraMessage.textContent =
            "Starting camera...";


        const constraints = {

            audio: false,

            video: {

                facingMode: {

                    ideal: cameraFacing

                },

                width: {

                    ideal: 1280

                },

                height: {

                    ideal: 720

                }

            }

        };


        cameraStream =
            await navigator
                .mediaDevices
                .getUserMedia(
                    constraints
                );


        video.srcObject =
            cameraStream;


        await video.play();


        cameraRunning = true;


        cameraMessage.style.display =
            "none";


        cameraMode.textContent =
            cameraFacing === "user"
                ? "Front"
                : "Back";


        smoothX = null;

        smoothY = null;


        status.textContent =
            "Camera started. Show the colored pen tip.";


        resizeCanvases();


        detectLoop();

    }

    catch (error) {

        console.error(
            "Camera error:",
            error
        );


        cameraRunning = false;


        cameraMessage.style.display =
            "block";


        cameraMessage.textContent =
            "Camera access failed.";


        status.textContent =
            "Allow camera permission and use HTTPS or localhost.";
    }
}


/* =========================================================
   STOP CAMERA
========================================================= */

async function stopCamera() {

    cameraRunning = false;


    if (
        animationId !== null
    ) {

        cancelAnimationFrame(
            animationId
        );

        animationId = null;
    }


    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );


        cameraStream = null;
    }


    video.srcObject = null;


    detectedDot.style.display =
        "none";


    cameraMessage.style.display =
        "block";


    cameraMessage.textContent =
        "Camera stopped.";


    smoothX = null;

    smoothY = null;
}


/* =========================================================
   SWITCH CAMERA
========================================================= */

async function switchCamera() {

    cameraFacing =
        cameraFacing === "user"
            ? "environment"
            : "user";


    cameraMode.textContent =
        cameraFacing === "user"
            ? "Front"
            : "Back";


    if (cameraStream) {

        await startCamera();

    } else {

        status.textContent =
            "Camera selected: " +
            (
                cameraFacing === "user"
                    ? "Front"
                    : "Back"
            ) +
            ". Press Start Camera.";
    }
}


/* =========================================================
   DETECTION LOOP
========================================================= */

function detectLoop() {

    if (!cameraRunning) {

        return;
    }


    detectPen();


    animationId =
        requestAnimationFrame(
            detectLoop
        );
}


/* =========================================================
   DETECT PEN
========================================================= */

function detectPen() {

    if (
        !video.videoWidth ||
        !video.videoHeight
    ) {

        return;
    }


    const W = 320;

    const H = 240;


    processingCanvas.width = W;

    processingCanvas.height = H;


    processingCtx.drawImage(
        video,
        0,
        0,
        W,
        H
    );


    let src = null;

    let rgb = null;

    let hsv = null;

    let mask = null;

    let kernel = null;

    let contours = null;

    let hierarchy = null;


    try {

        src =
            cv.imread(
                processingCanvas
            );


        rgb = new cv.Mat();

        hsv = new cv.Mat();

        mask = new cv.Mat();


        /*
           RGBA → RGB
        */

        cv.cvtColor(
            src,
            rgb,
            cv.COLOR_RGBA2RGB
        );


        /*
           RGB → HSV
        */

        cv.cvtColor(
            rgb,
            hsv,
            cv.COLOR_RGB2HSV
        );


        const lower =
            new cv.Mat(
                hsv.rows,
                hsv.cols,
                hsv.type(),
                [
                    LOWER_H,
                    LOWER_S,
                    LOWER_V,
                    0
                ]
            );


        const upper =
            new cv.Mat(
                hsv.rows,
                hsv.cols,
                hsv.type(),
                [
                    UPPER_H,
                    UPPER_S,
                    UPPER_V,
                    255
                ]
            );


        /*
           HSV threshold.
        */

        cv.inRange(
            hsv,
            lower,
            upper,
            mask
        );


        lower.delete();

        upper.delete();


        /*
           Noise removal.
        */

        kernel =
            cv.getStructuringElement(
                cv.MORPH_ELLIPSE,
                new cv.Size(
                    5,
                    5
                )
            );


        cv.morphologyEx(
            mask,
            mask,
            cv.MORPH_OPEN,
            kernel
        );


        cv.morphologyEx(
            mask,
            mask,
            cv.MORPH_CLOSE,
            kernel
        );


        /*
           Find contours.
        */

        contours =
            new cv.MatVector();

        hierarchy =
            new cv.Mat();


        cv.findContours(
            mask,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );


        let bestIndex = -1;

        let bestScore =
            -Infinity;


        for (
            let i = 0;
            i < contours.size();
            i++
        ) {

            const contour =
                contours.get(i);


            const area =
                cv.contourArea(
                    contour
                );


            if (
                area < 15 ||
                area > 8000
            ) {

                contour.delete();

                continue;
            }


            const rect =
                cv.boundingRect(
                    contour
                );


            const rectArea =
                rect.width *
                rect.height;


            if (
                rectArea <= 0
            ) {

                contour.delete();

                continue;
            }


            const fill =
                area /
                rectArea;


            const moments =
                cv.moments(
                    contour,
                    false
                );


            if (
                moments.m00 === 0
            ) {

                contour.delete();

                continue;
            }


            const cx =
                moments.m10 /
                moments.m00;


            const cy =
                moments.m01 /
                moments.m00;


            let proximity = 1;


            if (
                smoothX !== null &&
                smoothY !== null
            ) {

                const dx =
                    cx - smoothX;


                const dy =
                    cy - smoothY;


                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );


                proximity =
                    Math.max(
                        0,
                        1 -
                        distance / 160
                    );
            }


            const areaScore =
                Math.min(
                    area / 500,
                    5
                );


            const fillScore =
                fill * 2;


            const score =
                areaScore +
                fillScore +
                proximity * 3;


            if (
                score >
                bestScore
            ) {

                bestScore =
                    score;

                bestIndex =
                    i;
            }


            contour.delete();
        }


        if (
            bestIndex >= 0
        ) {

            const contour =
                contours.get(
                    bestIndex
                );


            const moments =
                cv.moments(
                    contour,
                    false
                );


            if (
                moments.m00 !== 0
            ) {

                const rawX =
                    moments.m10 /
                    moments.m00;


                const rawY =
                    moments.m01 /
                    moments.m00;


                /*
                   Smooth the pen position.
                */

                if (
                    smoothX === null
                ) {

                    smoothX = rawX;

                    smoothY = rawY;

                } else {

                    smoothX =
                        smoothX +
                        SMOOTHING *
                        (
                            rawX -
                            smoothX
                        );


                    smoothY =
                        smoothY +
                        SMOOTHING *
                        (
                            rawY -
                            smoothY
                        );
                }


                showDetectedDot(
                    smoothX,
                    smoothY,
                    W,
                    H
                );


                processDetectedPen(
                    smoothX,
                    smoothY,
                    W,
                    H
                );
            }


            contour.delete();


        } else {

            detectedDot.style.display =
                "none";


            finishCurrentStroke();
        }

    }

    catch (error) {

        console.error(
            "OpenCV detection error:",
            error
        );

    }

    finally {

        if (src)
            src.delete();

        if (rgb)
            rgb.delete();

        if (hsv)
            hsv.delete();

        if (mask)
            mask.delete();

        if (kernel)
            kernel.delete();

        if (contours)
            contours.delete();

        if (hierarchy)
            hierarchy.delete();
    }
}


/* =========================================================
   SHOW DETECTED DOT
========================================================= */

function showDetectedDot(
    x,
    y,
    width,
    height
) {

    const rect =
        overlayCanvas
            .getBoundingClientRect();


    let displayX =
        x /
        width *
        rect.width;


    let displayY =
        y /
        height *
        rect.height;


    /*
       Front camera is mirrored.
    */

    if (
        cameraFacing === "user"
    ) {

        displayX =
            rect.width -
            displayX;
    }


    detectedDot.style.left =
        displayX + "px";


    detectedDot.style.top =
        displayY + "px";


    detectedDot.style.display =
        "block";
}


/* =========================================================
   DISPLAY CAMERA POINT
========================================================= */

function getDisplayCameraPoint(
    rawX,
    rawY,
    width,
    height
) {

    let x = rawX;

    let y = rawY;


    if (
        cameraFacing === "user"
    ) {

        x =
            width -
            rawX;
    }


    return {
        x: x,
        y: y
    };
}


/* =========================================================
   PROCESS PEN
========================================================= */

function processDetectedPen(
    x,
    y,
    width,
    height
) {

    /*
       Calibration mode.
    */

    if (
        calibrationActive
    ) {

        drawCalibrationOverlay();

        return;
    }


    /*
       Must calibrate first.
    */

    if (
        !perspectiveMatrix
    ) {

        finishCurrentStroke();


        status.textContent =
            "🎯 Calibrate the 4 corners first.";


        drawNormalOverlay();

        return;
    }


    /*
       Convert to visible camera coordinates.
    */

    const displayPoint =
        getDisplayCameraPoint(
            x,
            y,
            width,
            height
        );


    /*
       PEN-UP zone.
    */

    const zoneX =
        width *
        PEN_UP_ZONE.x;


    const zoneY =
        height *
        PEN_UP_ZONE.y;


    const zoneRadius =
        Math.min(
            width,
            height
        ) *
        PEN_UP_ZONE.radius;


    const dx =
        displayPoint.x -
        zoneX;


    const dy =
        displayPoint.y -
        zoneY;


    const distance =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (
        distance <= zoneRadius
    ) {

        if (
            writingEnabled
        ) {

            finishCurrentStroke();

            writingEnabled =
                false;
        }


        status.textContent =
            "🟡 PEN-UP • Writing paused.";


        drawNormalOverlay();

        return;
    }


    /*
       Enable writing.
    */

    writingEnabled = true;


    /*
       TRUE perspective mapping.
    */

    const mapped =
        transformPoint(
            x,
            y
        );


    if (!mapped) {

        return;
    }


    /*
       Ignore very large jumps.
    */

    if (
        lastDrawX !== null &&
        lastDrawY !== null
    ) {

        const dx =
            mapped.x -
            lastDrawX;


        const dy =
            mapped.y -
    
