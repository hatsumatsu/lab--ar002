function isMobile() {
    return /Android|mobile|iPad|iPhone/i.test(navigator.userAgent);
}

const frameLength = 200; // in ms
const interpolationFactor = 8;

let trackedMatrix = {
    // for interpolation
    delta: [
        0,0,0,0,
        0,0,0,0,
        0,0,0,0,
        0,0,0,0
    ],
    interpolated: [
        0,0,0,0,
        0,0,0,0,
        0,0,0,0,
        0,0,0,0        
    ]
}

let ARObject;

let markers = {
    'pinball': {
        url: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/181962/pinball',
    },
};

let setMatrix = function( matrix, value ) {
    let array = [];
    
    for( let key in value ) {
        array[key] = value[key];
    }
    
    if( typeof matrix.elements.set === 'function' ) {
        matrix.elements.set( array );
    } else {
        matrix.elements = [].slice.call( array );
    }
};

function start( container, marker, video, input_width, input_height, canvas_draw, render_update, track_update ) {
    let vw, vh;
    let sw, sh;
    let pscale, sscale;
    let w, h;
    let pw, ph;
    let ox, oy;
    let worker;

    let canvas_process = document.createElement( 'canvas' );
    let context_process = canvas_process.getContext( '2d' );

    
/**
 * RENDERER
 */
    let renderer = new THREE.WebGLRenderer( { 
        canvas: canvas_draw, 
        alpha: true, 
        antialias: true 
    } );
    
    renderer.setPixelRatio( window.devicePixelRatio );

    
/**
 * SCENE
 */
    let scene = new THREE.Scene();


/**
 * LIGHTS
 */
    const light = new THREE.AmbientLight( 0xffffff );
    scene.add( light);

    
/**
 * CAMERA
 */    
    let camera = new THREE.Camera();
    camera.matrixAutoUpdate = false;
    scene.add( camera );

    
/**
 * ROOT
 */    
    let root = new THREE.Object3D();
    root.matrixAutoUpdate = false;
    
    scene.add( root );    


/**
 * OBJECT
 */     
    let ARVideo = document.getElementById( 'arvideo' );
    let texture = new THREE.VideoTexture( ARVideo );
    let material = new THREE.MeshLambertMaterial( { 
        color: 0xffffff, 
        map: texture 
    } );

    ARVideo.play();


    let ARObjectGeometry = new THREE.PlaneGeometry( 1, 1, 1, 1 );
    ARObject = new THREE.Mesh( ARObjectGeometry, material );
    ARObject.position.z = 0;
    ARObject.position.x = 100;
    ARObject.position.y = 100;
    ARObject.scale.set( 200, 200, 200 );

    root.add( ARObject );


    let load = () => {
        // 360 / 240
        vw = input_width;
        vh = input_height;


        pscale = 320 / Math.max( vw, vh / 3 * 4 );
        sscale = isMobile() ? window.outerWidth / input_width : 1;

        sw = vw * sscale;
        sh = vh * sscale;

        // video.style.width = sw + 'px';
        // video.style.height = sh + 'px';
        // container.style.width = sw + 'px';
        // container.style.height = sh + 'px';
        // canvas_draw.style.clientWidth = sw + 'px';
        // canvas_draw.style.clientHeight = sh + 'px';

        canvas_draw.width = sw;
        canvas_draw.height = sh;
        w = vw * pscale;
        h = vh * pscale;
        pw = Math.max( w, h / 3 * 4 );
        ph = Math.max( h, w / 4 * 3 );
        ox = ( pw - w ) / 2;
        oy = ( ph - h ) / 2;
        // canvas_process.style.clientWidth = pw + 'px';
        // canvas_process.style.clientHeight = ph + 'px';
        canvas_process.width = pw;
        canvas_process.height = ph;

        renderer.setSize( sw, sh );

        console.table( [
            ['vw', vw],
            ['vh', vh],
            ['pscale', pscale],
            ['sscale', sscale],
            ['sw', sw],
            ['sh', sh],
            ['w', w],
            ['h', h],
            ['pw', pw],
            ['ph', ph],
            ['ox', oy]
        ] );


        // service worker
        worker = new Worker( 'js/worker.js' );

        worker.postMessage( { 
            type: 'load', 
            pw: pw, 
            ph: ph, 
            marker: marker.url 
        } );

        worker.onmessage = ( event ) => {
            let message = event.data; 

            switch( message.type ) {
                case 'loaded': {                    
                    let proj = JSON.parse( message.proj );
                    let ratioW = pw / w;
                    let ratioH = ph / h;
                    
                    proj[0] *= ratioW;
                    proj[4] *= ratioW;
                    proj[8] *= ratioW;
                    proj[12] *= ratioW;
                    proj[1] *= ratioH;
                    proj[5] *= ratioH;
                    proj[9] *= ratioH;
                    proj[13] *= ratioH;
                    
                    // set camera matrix to detected 'projection' matrix
                    setMatrix( camera.projectionMatrix, proj );

                    document.body.classList.remove( 'loading' );
                    
                    break;
                }

                case 'found': {
                    found( message );
                    
                    break;
                }

                case 'not found': {
                    found( null );
                    
                    break;
                }
            }
            
            /**
             * Callback
             */
            track_update();
            
            process();
        };
    };

    
    let world;


    let found = ( message ) => {
        if( !message ) {
            world = null;
        } else {
            world = JSON.parse( message.matrixGL_RH );
        }
    };
    

    
    /** 
     * Renders the THREE.js scene
     */
    let draw = () => {

        /**
         * Callback 
         */
        render_update();
        

        // marker not found
        if( !world ) {
            ARObject.visible = false;

        // marker found            
        } else {
            ARObject.visible = true;

            // interpolate matrix
            for( let i = 0; i < 16; i++ ) { 
                trackedMatrix.delta[i] = world[i] - trackedMatrix.interpolated[i];            
                trackedMatrix.interpolated[i] = trackedMatrix.interpolated[i] + ( trackedMatrix.delta[i] / interpolationFactor );
            }        

            // set matrix of 'root' by detected 'world' matrix
            setMatrix( root.matrix, trackedMatrix.interpolated );
        }

        
        renderer.render( scene, camera );
    };



    /**
     * This is called on every frame 
     */ 
    function process() {
        // clear canvas
        context_process.fillStyle = 'black';
        context_process.fillRect( 0, 0, pw, ph );
        
        // draw video to canvas
        context_process.drawImage( video, 0, 0, vw, vh, ox, oy, w, h );
    
        // send video frame to worker
        let imageData = context_process.getImageData( 0, 0, pw, ph );
        worker.postMessage( 
            { 
                type: 'process', 
                imagedata: imageData 
            }, 
            [ 
                imageData.data.buffer
            ]
        );
    }
    
    
    let tick = () => {
        draw();
        
        requestAnimationFrame( tick );
    };
    
    

    load();
    tick();
    process();
}