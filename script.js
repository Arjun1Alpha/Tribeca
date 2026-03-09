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
    uniform vec2 resolution;

    void main() {
        // Use plain UVs so the WebGL image is not stretched.
        // On mobile the canvas is hidden and CSS <img> handles cover.
        vec2 uv = vUv;

        // Displacement map sample (Codrops-style)
        vec4 disp = texture2D(dispMap, uv);
        vec2 dispVec = disp.rg * 2.0 - 1.0;

        // Distortion envelope: 0 → 1 → 0 over the course of the transition
        float mid = 1.0 - abs(2.0 * dispFactor - 1.0); // 0→1→0
        float strength = intensity * mid;

        // Slight tilt so motion feels like flowing water
        vec2 flowDir = normalize(vec2(0.6, 1.0));
        vec2 flow = dot(dispVec, flowDir) * flowDir;

        vec2 distortedFrom = uv + flow * strength * (1.0 - dispFactor);
        vec2 distortedTo   = uv - flow * strength * dispFactor;

        vec4 fromTex = texture2D(currentImage, distortedFrom);
        vec4 toTex   = texture2D(nextImage,   distortedTo);

        // Opacity of new image still goes 0 → 1 linearly
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
    dispMap = loader.load('displacement/1.jpg');
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
            // Even lower intensity for a lighter, smoother effect
            intensity:    { type: "f", value: -0.12 },
            resolution:   { type: "v2", value: new THREE.Vector2(renderW, renderH) }
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

            // On mobile (canvas hidden), show only the background image for this slide
            syncBackgroundImages();

            // Slightly faster slide/displacement animation
            const duration = 3.0;

            document.getElementById('pagination').querySelectorAll('.active')[0].className = '';
            pagButtons[slideId].className = 'active';

            mat.uniforms.nextImage.value = sliderImages[slideId];
            mat.uniforms.nextImage.needsUpdate = true;

            if (window.updateChromeCubeTransition) {
                window.updateChromeCubeTransition(sliderImages[slideId], duration, slideId);
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
            let slideTaglineEl = document.getElementById('slide-tagline');
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

            // Tagline: visible only on slide 0, hidden on other slides.
            // Reveal order: main title first, then tagline.
            if (slideTaglineEl) {
                if (slideId === 0) {
                    // Delay tagline so it starts after the main title has faded in
                    TweenLite.to(slideTaglineEl, duration * 0.35, {
                        autoAlpha: 1,
                        delay: duration * 0.6,
                        ease: 'Power2.easeOut'
                    });
                } else {
                    // Hide tagline quickly when leaving slide 0
                    TweenLite.to(slideTaglineEl, duration * 0.2, {
                        autoAlpha: 0,
                        ease: 'Power2.easeIn'
                    });
                }
            }
        }

        // Expose slide changer globally so other UI (e.g. hover blocks)
        // can trigger WebGL background transitions.
        window.displacementGoToSlide = goToSlide;

        // Keep background <img> in sync with current slide (for mobile when canvas is hidden)
        function syncBackgroundImages() {
            let bgImgs = parent.querySelectorAll('#slider > img');
            for (let i = 0; i < bgImgs.length; i++) {
                bgImgs[i].style.opacity = (i === currentSlide) ? '1' : '0';
                bgImgs[i].style.pointerEvents = (i === currentSlide) ? 'auto' : 'none';
            }
        }
        syncBackgroundImages(); // init: show first slide image

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
        if (mat.uniforms.resolution) {
            mat.uniforms.resolution.value.set(renderW, renderH);
        }
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
let chromeEnvMap = null; // current environment map
let chromeSlideEnvMaps = []; // env map per slide
// Base Y rotation (tweened on scroll); cursor follow adds on top
let chromeCubeBase = { y: 0 };
let chromeCubeMouseX = 0;
let chromeCubeMouseY = 0;
// Smoothed values for fluid cursor follow (eased toward mouse targets)
let chromeCubeEasedX = 0;
let chromeCubeEasedY = 0;
// Current slide texture applied to cube and transition progress (0→1→0)
let chromeCurrentSlideTex = null;
let chromeSlideEffect = { p: 0 };

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
    // Behind text (#slider-content, z-index: 5) but above background
    chromeRenderer.domElement.style.zIndex = "4";
    chromeRenderer.domElement.style.pointerEvents = "none";
    chromeRenderer.domElement.classList.add("cube-canvas");
    document.body.appendChild(chromeRenderer.domElement);

    // Environment maps for reflections per slide (3 background images)
    const envTexLoader = new THREE.TextureLoader();
    const envSlidePaths = ['Edge_Tower.jpg.jpeg', 'TRG_AquaBar.jpeg', 'TTG_Living.jpg.jpeg'];

    if (typeof THREE.PMREMGenerator !== 'undefined') {
        const pmremGen = new THREE.PMREMGenerator(chromeRenderer);
        pmremGen.compileEquirectangularShader();

        envSlidePaths.forEach(function (path, idx) {
            envTexLoader.load(
                path,
                function (texture) {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    const env = pmremGen.fromEquirectangular(texture).texture;
                    texture.dispose();
                    chromeSlideEnvMaps[idx] = env;

                    // Use first slide env map as initial environment
                    if (idx === 0) {
                        chromeEnvMap = env;
                        chromeScene.environment = chromeEnvMap;
                        applyEnvMapToChromeModel(chromeCube);
                    }
                }
            );
        });
    } else {
        envSlidePaths.forEach(function (path, idx) {
            envTexLoader.load(
                path,
                function (texture) {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    chromeSlideEnvMaps[idx] = texture;
                    if (idx === 0) {
                        chromeEnvMap = texture;
                        chromeScene.environment = chromeEnvMap;
                        applyEnvMapToChromeModel(chromeCube);
                    }
                }
            );
        });
    }

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
                        // Neutral base color so reflections and textures are not tinted
                        if ('color' in mat) mat.color.set(0xffffff);
                        // Make the cube more reflective and less rough for clearer reflections
                        if ('metalness' in mat) mat.metalness = 0.9;
                        if ('roughness' in mat) mat.roughness = 0.9;
                        if ('envMapIntensity' in mat) mat.envMapIntensity = 1.6;
                    });
                }
            });

            chromeScene.add(chromeCube);
            applyEnvMapToChromeModel(chromeCube);

            // After cube is ready, apply the first slide as reflection/surface
            if (sliderImages && sliderImages.length > 0 && window.updateChromeCubeTransition) {
                window.updateChromeCubeTransition(sliderImages[0], 0.1, 0);
            }
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

window.updateChromeCubeTransition = function (tex, durationSeconds, slideId) {
    if (!chromeCube || !tex || durationSeconds <= 0) return;

    chromeCurrentSlideTex = tex;

    // Use the slide's dedicated env map (if loaded) for reflections.
    chromeCube.traverse(function (child) {
        if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(function (mat) {
                if (!mat.userData) mat.userData = {};
                if (mat.userData.baseEnvIntensity === undefined && 'envMapIntensity' in mat) {
                    mat.userData.baseEnvIntensity = mat.envMapIntensity;
                }

                // Pick env map for this slide (fallback to first / current)
                var envForSlide = (typeof slideId === 'number' && chromeSlideEnvMaps[slideId])
                    ? chromeSlideEnvMaps[slideId]
                    : (chromeEnvMap || chromeSlideEnvMaps[0]);

                if (envForSlide && 'envMap' in mat) {
                    mat.envMap = envForSlide;
                    mat.needsUpdate = true;
                }
            });
        }
    });

    // Animate a 0→1→0 envelope in chromeSlideEffect.p,
    // reusing the same overall duration as the background transition.
    chromeSlideEffect.p = 0;
    TweenLite.to(chromeSlideEffect, durationSeconds / 2, {
        p: 1,
        ease: 'Power2.easeInOut',
        yoyo: true,
        repeat: 1
    });
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

        // Apply the same 0→1→0 envelope as a smooth reflection strength change
        // so the cube's reflections "breathe" in sync with the background effect.
        var mid = 1.0 - Math.abs(2.0 * chromeSlideEffect.p - 1.0); // 0→1→0
        chromeCube.traverse(function (child) {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(function (mat) {
                    if ('envMapIntensity' in mat) {
                        if (!mat.userData) mat.userData = {};
                        var base = mat.userData.baseEnvIntensity !== undefined
                            ? mat.userData.baseEnvIntensity
                            : mat.envMapIntensity || 1.0;
                        mat.userData.baseEnvIntensity = base;
                        // Pulse between base and base + 0.4
                        mat.envMapIntensity = base + mid * 0.4;
                    }
                });
            }
        });
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
