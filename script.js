const displacementSlider = function(opts) {

    let vertex = `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `;

    let fragment = `
    varying vec2 vUv;

    uniform sampler2D currentImage;
    uniform sampler2D nextImage;
    uniform sampler2D dispMap;
    uniform float dispFactor;
    uniform float intensity;

    void main() {
        vec2 uv = vUv;

        // Displacement map sample (Codrops-style)
        vec4 disp = texture2D(dispMap, uv);
        vec2 dispVec = disp.rg * 2.0 - 1.0;

        // Make distortion strongest in the middle of the transition
        // and zero at the start (0.0) and end (1.0).
        float mid = 1.0 - abs(2.0 * dispFactor - 1.0); // 0→1→0 curve
        float strength = intensity * mid;

        vec2 distortedFrom = uv + dispVec * strength * (1.0 - dispFactor);
        vec2 distortedTo   = uv - dispVec * strength * dispFactor;

        vec4 fromTex = texture2D(currentImage, distortedFrom);
        vec4 toTex   = texture2D(nextImage,   distortedTo);

        gl_FragColor = mix(fromTex, toTex, dispFactor);
    }
`;

    let images = opts.images, image, sliderImages = [];
    let parent = opts.parent;
    let dispMap;

    let renderW = window.innerWidth || document.documentElement.clientWidth;
    let renderH = window.innerHeight || document.documentElement.clientHeight;

    let renderer = new THREE.WebGLRenderer({
        antialias: false,
    });

    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setClearColor( 0x23272A, 1.0 );
    renderer.setSize( renderW, renderH );
    parent.appendChild( renderer.domElement );

    let loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    images.forEach( ( img ) => {
        image = loader.load( img.getAttribute( 'src' ) + '?v=' + Date.now() );
        image.magFilter = image.minFilter = THREE.LinearFilter;
        image.anisotropy = renderer.capabilities.getMaxAnisotropy();
        sliderImages.push( image );
    });

    // Displacement texture used to mimic theme-6 hover-effect style
    // (same as data-displacement="img/displacement/1.jpg" in the demo)
    dispMap = loader.load('hover-effect/example/img/displacement/1.jpg');
    dispMap.magFilter = dispMap.minFilter = THREE.LinearFilter;

    let scene = new THREE.Scene();
    let camera = new THREE.OrthographicCamera(
        renderW / -2,
        renderW / 2,
        renderH / 2,
        renderH / -2,
        0.1,
        1000
    );

    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, -100);

    let ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    let dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    let mat = new THREE.ShaderMaterial({
        uniforms: {
            dispFactor:   { type: "f", value: 0.0 },
            currentImage: { type: "t", value: sliderImages[0] },
            nextImage:    { type: "t", value: sliderImages[1] },
            dispMap:      { type: "t", value: dispMap },
            // Match theme-6 intensity (~-0.4) from the Codrops example
            intensity:    { type: "f", value: -0.4 }
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: false,
        depthWrite: true,
        depthTest: true
    });

    let geometry = new THREE.PlaneBufferGeometry(
        parent.offsetWidth,
        parent.offsetHeight,
        1
    );
    let object = new THREE.Mesh(geometry, mat);
    object.position.set(0, 0, -10);
    scene.add(object);

    let addEvents = function(){

        let pagButtons = Array.from(document.getElementById('pagination').querySelectorAll('button'));
        let isAnimating = false;
        let currentSlide = 0;
        let totalSlides = pagButtons.length;
        let wheelCooldown = 0;
        let touchStartX = 0;

        function goToSlide(slideId) {
            if (isAnimating) return;
            slideId = Math.max(0, Math.min(slideId, totalSlides - 1));
            if (slideId === currentSlide) return;

            isAnimating = true;
            let prevSlide = currentSlide;
            currentSlide = slideId;

            // Slightly faster slide/displacement animation
            const duration = 3.0;

            document.getElementById('pagination').querySelectorAll('.active')[0].className = '';
            pagButtons[slideId].className = 'active';

            mat.uniforms.nextImage.value = sliderImages[slideId];
            mat.uniforms.nextImage.needsUpdate = true;

            if (window.updateChromeCubeTransition) {
                window.updateChromeCubeTransition(sliderImages[slideId], duration);
            }
            if (window.rotateChromeCubeOnScroll) {
                window.rotateChromeCubeOnScroll(prevSlide, slideId, duration);
            }

            TweenLite.to( mat.uniforms.dispFactor, duration, {
                value: 1,
                ease: 'Power2.easeInOut',
                onComplete: function () {
                    mat.uniforms.currentImage.value = sliderImages[slideId];
                    mat.uniforms.currentImage.needsUpdate = true;
                    mat.uniforms.dispFactor.value = 0.0;
                    isAnimating = false;
                }
            });

            let slideTitleEl = document.getElementById('slide-title');
            let slideStatusEl = document.getElementById('slide-status');
            let nextSlideTitle = document.querySelectorAll(`[data-slide-title="${slideId}"]`)[0].innerHTML;
            let nextSlideStatus = document.querySelectorAll(`[data-slide-status="${slideId}"]`)[0].innerHTML;

            TweenLite.to( slideTitleEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });
            TweenLite.to( slideStatusEl, duration * 0.15, { autoAlpha: 0, y: 15, ease: 'Power2.easeIn' });

            TweenLite.delayedCall( duration * 0.2, function() {
                slideTitleEl.innerHTML = nextSlideTitle;
                slideStatusEl.innerHTML = nextSlideStatus;
            });

            TweenLite.to( slideTitleEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.45, ease: 'Power2.easeOut' });
            TweenLite.to( slideStatusEl, duration * 0.5, { autoAlpha: 1, y: 0, delay: duration * 0.5, ease: 'Power2.easeOut' });
        }

        // Expose slide changer globally so other UI (e.g. hover blocks)
        // can trigger WebGL background transitions.
        window.displacementGoToSlide = goToSlide;

        pagButtons.forEach( (el) => {
            el.addEventListener('click', function() {
                let slideId = parseInt( this.dataset.slide, 10 );
                goToSlide(slideId);
            });
        });

        window.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToSlide(currentSlide - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToSlide(currentSlide + 1);
            }
        });

        parent.addEventListener('wheel', function(e) {
            e.preventDefault();
            if (isAnimating) return;
            if (wheelCooldown > 0) return;
            wheelCooldown = 1;
            setTimeout(function() { wheelCooldown = 0; }, 800);
            if (e.deltaY > 0) goToSlide(currentSlide + 1);
            else if (e.deltaY < 0) goToSlide(currentSlide - 1);
        }, { passive: false });

        parent.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        parent.addEventListener('touchend', function(e) {
            if (e.changedTouches.length === 0) return;
            let touchEndX = e.changedTouches[0].clientX;
            let deltaX = touchStartX - touchEndX;
            const minSwipe = 60;
            if (deltaX > minSwipe) goToSlide(currentSlide + 1);
            else if (deltaX < -minSwipe) goToSlide(currentSlide - 1);
        }, { passive: true });

    };

    addEvents();

    window.addEventListener( 'resize' , function(e) {
        renderW = window.innerWidth || document.documentElement.clientWidth;
        renderH = window.innerHeight || document.documentElement.clientHeight;
        renderer.setSize(renderW, renderH);
        camera.left = renderW / -2;
        camera.right = renderW / 2;
        camera.top = renderH / 2;
        camera.bottom = renderH / -2;
        camera.updateProjectionMatrix();
    });

    let animate = function() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    };
    animate();

    // ✅ Return sliderImages so initChromeCube can use the first texture
    return { sliderImages: sliderImages };
};

// ---- Chrome cube in its own canvas (second renderer) ----
// Same WebGL transition shader as slider (noise + triangle grid reveal) + fake reflection
const CUBE_TRANSITION_VERTEX = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;
const CUBE_TRANSITION_FRAGMENT = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    uniform sampler2D currentImage;
    uniform sampler2D nextImage;
    uniform sampler2D pattern;
    uniform float dispFactor;
    uniform float patternMix;
    uniform float reflectStrength;
    float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = rand(i);
        float b = rand(i + vec2(1.0, 0.0));
        float c = rand(i + vec2(0.0, 1.0));
        float d = rand(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float lineDist(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
    }
    float triangleGrid(vec2 uv, float scale, float lineWidth) {
        vec2 g = uv * scale;
        float pw = lineWidth;
        vec2 local = fract(g);
        float d = 1.0;
        d = min(d, lineDist(local, vec2(0.0,0.0), vec2(1.0,0.0)));
        d = min(d, lineDist(local, vec2(0.0,0.0), vec2(0.0,1.0)));
        d = min(d, lineDist(local, vec2(1.0,0.0), vec2(0.0,1.0)));
        d = min(d, lineDist(local, vec2(1.0,0.0), vec2(1.0,1.0)));
        d = min(d, lineDist(local, vec2(0.0,1.0), vec2(1.0,1.0)));
        return 1.0 - smoothstep(pw * 0.5, pw * 1.5, d);
    }
    void main() {
        vec2 uv = vUv;

        // Same triangle/noise transition as the slider
        float t = smoothstep(0.0, 1.0, dispFactor);
        float n  = noise(uv * 4.0)  * 0.5;
        n += noise(uv * 8.0)  * 0.25;
        n += noise(uv * 16.0) * 0.125;
        n += noise(uv * 32.0) * 0.0625;
        float reveal = n;
        float edgeGrain = (rand(uv * 220.0) - 0.5) * 0.12 + (rand(uv * 470.0 + 0.5) - 0.5) * 0.06;
        float grid = triangleGrid(uv, 30.0, 0.03);
        reveal += edgeGrain * 0.8 + grid * 0.06;
        float mask = smoothstep(reveal - 0.14, reveal + 0.14, t);

        vec4 fromTex = texture2D(currentImage, uv);
        vec4 toTex  = texture2D(nextImage, uv);
        vec4 finalColor = mix(fromTex, toTex, mask);

        // Subtle dark pattern overlay only (no reflection)
        vec4 patternTex = texture2D(pattern, uv);
        float patternAlpha = patternTex.a > 0.01 ? patternTex.a : 0.0;
        float darkFactor = patternMix * patternAlpha * 0.18;
        finalColor.rgb = mix(finalColor.rgb, vec3(0.0), darkFactor);

        gl_FragColor = finalColor;
    }
`;

let chromeScene, chromeCamera, chromeRenderer, chromeCube, chromePmremGenerator;
let chromeEnvMap = null; // shared environment map for reflective GLTF model
// Base Y rotation (tweened on scroll); cursor follow adds on top
let chromeCubeBase = { y: 0 };
let chromeCubeMouseX = 0;
let chromeCubeMouseY = 0;
// Smoothed values for fluid cursor follow (eased toward mouse targets)
let chromeCubeEasedX = 0;
let chromeCubeEasedY = 0;

// ✅ Accepts sliderImages as a parameter (unused now) — kept for API compatibility
function initChromeCube(sliderImages) {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;

    chromeScene = new THREE.Scene();

    chromeCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    chromeCamera.position.set(0, 0, 6);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    chromeScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    chromeScene.add(dirLight);

    chromeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    chromeRenderer.setPixelRatio(window.devicePixelRatio);
    chromeRenderer.setSize(width, height);
    chromeRenderer.domElement.style.position = "fixed";
    chromeRenderer.domElement.style.top = "0";
    chromeRenderer.domElement.style.left = "0";
    chromeRenderer.domElement.style.zIndex = "6";
    chromeRenderer.domElement.style.pointerEvents = "none";
    document.body.appendChild(chromeRenderer.domElement);

    // Environment map for reflections on the GLTF box (like forth-concept)
    const envTexLoader = new THREE.TextureLoader();
    envTexLoader.load(
        'Edge_Tower.jpg.jpeg',
        function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.encoding = THREE.sRGBEncoding;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            if (typeof THREE.PMREMGenerator !== 'undefined') {
                const pmremGen = new THREE.PMREMGenerator(chromeRenderer);
                pmremGen.compileEquirectangularShader();
                chromeEnvMap = pmremGen.fromEquirectangular(texture).texture;
                texture.dispose();
                pmremGen.dispose();
            } else {
                chromeEnvMap = texture;
            }

            chromeScene.environment = chromeEnvMap;
            applyEnvMapToChromeModel(chromeCube);
        }
    );

    // Load external 3D box model (box4.glb) instead of procedural cube
    const loader = new THREE.GLTFLoader();
    loader.load(
        'box4.glb',
        function (gltf) {
            chromeCube = gltf.scene;

            // Center and uniformly scale the model to fit nicely in view
            const box = new THREE.Box3().setFromObject(chromeCube);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            chromeCube.position.sub(center);

            // const maxDim = Math.max(size.x, size.y, size.z);
            // if (maxDim > 0) {
            //     const distance = 4.0;
            //     const fov = chromeCamera.fov * (Math.PI / 180);
            //     const visibleHeight = 2 * Math.tan(fov / 2) * distance;
            //     const scale = (visibleHeight * 0.35) / maxDim;
            //     chromeCube.scale.setScalar(scale);
            // }
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const distance = 4.5;
                const fov = chromeCamera.fov * (Math.PI / 180);
                const visibleHeight = 2 * Math.tan(fov / 2) * distance;
                const scale = (visibleHeight * 0.4) / maxDim;
                chromeCube.scale.setScalar(scale);
            }

            // Ensure materials are neutral (no yellow tint) but still a bit reflective
            chromeCube.traverse(function (child) {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(function (mat) {
                        mat.side = THREE.FrontSide;
                        mat.transparent = false;
                        mat.opacity = 1.0;
                        // Remove baked-in tint
                        if ('color' in mat) mat.color.set(0xffffff);
                        // Soften reflections to avoid strong yellow cast
                        if ('metalness' in mat) mat.metalness = 0.9;
                        if ('roughness' in mat) mat.roughness = 0.9;
                        if ('envMapIntensity' in mat) mat.envMapIntensity = 1.6;
                    });
                }
            });

            chromeScene.add(chromeCube);
            applyEnvMapToChromeModel(chromeCube);
        },
        undefined,
        function (error) {
            console.error('Error loading box4.glb:', error);
        }
    );

    window.addEventListener("resize", onChromeResize, false);
    window.addEventListener("mousemove", onChromeCubeMouseMove, false);
    animateChromeCube();
}

// Rotate cube 360° on Y when slide changes (scroll/click); same duration as transition
window.rotateChromeCubeOnScroll = function (prevSlide, slideId, durationSeconds) {
    if (!chromeCube || durationSeconds <= 0) return;
    var direction = slideId > prevSlide ? 1 : -1;
    var targetY = chromeCubeBase.y + direction * (Math.PI * 2);
    TweenLite.to(chromeCubeBase, durationSeconds, {
        y: targetY,
        ease: 'Power2.easeInOut',
        onComplete: function () {}
    });
};

// Cursor follow: update target tilt from mouse position (object leans toward cursor)
function onChromeCubeMouseMove(e) {
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    var nx = (e.clientX / w) - 0.5;  // -0.5 .. 0.5
    var ny = (e.clientY / h) - 0.5;
    // Move mouse up -> tilt cube up; move right -> rotate cube right
    chromeCubeMouseX = ny * 1.2;    // pitch (up/down)
    chromeCubeMouseY = -nx * 1.2;   // yaw offset (left/right)
}

window.updateChromeCubeTransition = function (tex, durationSeconds) {
    // Keep object image/reflection constant; only background slider changes.
    // Intentionally do nothing here.
    return;
};

// Set the cube's map to the slide texture (instant, no transition)
window.updateChromeMapFromTexture = function (tex) {
    // No-op for GLTF model; kept for compatibility
    return;
};

// Legacy: keep for any external refs; now a no-op (cube uses map, not env)
window.updateChromeEnvFromTexture = function (tex, envResolution) {
    // No-op for GLTF model; kept for compatibility
    return;
};

function onChromeResize() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    if (!chromeCamera || !chromeRenderer) return;
    chromeCamera.aspect = width / height;
    chromeCamera.updateProjectionMatrix();
    chromeRenderer.setSize(width, height);
}

function animateChromeCube() {
    requestAnimationFrame(animateChromeCube);

    if (chromeCube) {
        // Smooth cursor follow: ease both axes toward mouse targets (fluid motion)
        var ease = 0.18;
        chromeCubeEasedX += (chromeCubeMouseX - chromeCubeEasedX) * ease;
        chromeCubeEasedY += (chromeCubeMouseY - chromeCubeEasedY) * ease;
        chromeCube.rotation.x = chromeCubeEasedX;
        chromeCube.rotation.y = chromeCubeBase.y + chromeCubeEasedY;
    }

    if (chromeRenderer && chromeScene && chromeCamera) {
        chromeRenderer.render(chromeScene, chromeCamera);
    }
}

// Apply the shared env map to every material in the GLTF model so reflections work
function applyEnvMapToChromeModel(model) {
    if (!model || !chromeEnvMap) return;
    model.traverse(function (child) {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(function (mat) {
                if ('envMap' in mat) {
                    mat.envMap = chromeEnvMap;   // always the tower HDR, never a slide tex
                    mat.needsUpdate = true;       // ✅ force material recompile
                }
                if ('envMapIntensity' in mat) {
                    mat.envMapIntensity = 1.25;
                }
            });
        }
    });
}

imagesLoaded( document.querySelectorAll('img'), () => {

    document.body.classList.remove('loading');

    const el = document.getElementById('slider');
    const imgs = Array.from(el.querySelectorAll('img'));

    // ✅ Capture returned sliderImages and pass directly into initChromeCube
    const slider = new displacementSlider({ parent: el, images: imgs });
    initChromeCube(slider.sliderImages);

});

// Fallback: if loader overlay never clears, remove it only.
setTimeout(function () {
    if (document.body.classList.contains('loading')) {
        document.body.classList.remove('loading');
    }
}, 5000);
