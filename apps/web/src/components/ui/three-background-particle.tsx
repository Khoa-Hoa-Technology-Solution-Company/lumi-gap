"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "next-themes";

function createGlowSprite(colorHex = "#d3a3f7", strength = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, colorHex + "ff");
    grad.addColorStop(0.2, colorHex + "cc");
    grad.addColorStop(0.5, colorHex + "66");
    grad.addColorStop(1, "#0000");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);

    return new THREE.SpriteMaterial({
        map: tex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.5 * strength,
        blending: THREE.NormalBlending,
        depthWrite: false,
        depthTest: true,
    });
}

type Particle = {
    mesh: THREE.Mesh;
    basePos: THREE.Vector3;
    glow?: THREE.Sprite;
    dist: number;
    glowStrength: number;
};

export function ThreeBackgroundParticle() {
    const mountRef = useRef<HTMLDivElement>(null);
    const { theme, resolvedTheme } = useTheme();

    useEffect(() => {
        const isDark = resolvedTheme === "dark";
        const bgColor = isDark ? "#09090b" : "#f8fafc"; // slate-50
        const particleColor = "#3b82f6"; // blue-500
        const glowColor = "#60a5fa"; // blue-400

        const radius = 50;
        const spacing = 3;
        const waveSpeed = 0.5;
        const waveHeight = 2.5;
        const particleSize = 0.1;
        const mouseInfluence = 10.0;
        const mouseSmoothing = 0.05;
        const positionCam = { x: 0, y: 10, z: 60 };
        const glowRadius = 10;

        const container = mountRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(bgColor);

        const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambient);

        const group = new THREE.Group();
        scene.add(group);

        const spriteMat = createGlowSprite(glowColor, 2);
        const sphereGeometry = new THREE.SphereGeometry(particleSize, 12, 12);

        const particles: Particle[] = [];
        for (let x = -radius; x < radius; x++) {
            for (let z = -radius; z < radius; z++) {
                const dist = Math.sqrt(x * x + z * z);
                if (dist < radius) {
                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            color1: { value: new THREE.Color(particleColor) },
                            color2: { value: new THREE.Color(glowColor) },
                            uGlowStrength: { value: 0 },
                        },
                        vertexShader: `
                     varying vec3 vPosition;
                     void main() {
                        vPosition = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                     }
                  `,
                        fragmentShader: `
                     varying vec3 vPosition;
                     uniform vec3 color1;
                     uniform vec3 color2;
                     uniform float uGlowStrength;
                     void main() {
                        float h = (vPosition.y + 0.1) / 0.2;
                        vec3 color = mix(color1, color2, clamp(h, 0.0, 1.0));
                        float softGlow = smoothstep(0.7, 1.0, h);
                        color += color1 * softGlow * 0.20;
                        float fakeGlow = 0.07 + 0.21 * h;
                        color += fakeGlow;

                        color = mix(color, vec3(1.0, 1.0, 1.0), uGlowStrength * 0.8);
                        gl_FragColor = vec4(color, 1.0);
                     }
                  `,
                    });

                    const mesh = new THREE.Mesh(sphereGeometry, material);
                    const pos = new THREE.Vector3(x * spacing, 0, z * spacing);
                    mesh.position.copy(pos);
                    group.add(mesh);

                    let glow: THREE.Sprite | undefined = undefined;
                    if (spriteMat && dist < glowRadius) {
                        glow = new THREE.Sprite(spriteMat.clone());
                        glow.position.copy(pos);
                        glow.scale.set(particleSize * 7, particleSize * 7, 1);
                        group.add(glow);
                    }

                    particles.push({ mesh, basePos: pos.clone(), glow, dist, glowStrength: 0 });
                }
            }
        }

        const mouse = { x: 0, y: 0 };
        const targetMouse = { x: 0, y: 0 };

        const handleMouseMove = (e: MouseEvent) => {
            targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        };
        window.addEventListener("mousemove", handleMouseMove);

        const clock = new THREE.Clock();
        const initialCamPos = new THREE.Vector3(0, 10, 0);
        const targetCamPos = new THREE.Vector3(positionCam.x, positionCam.y, positionCam.z);
        const initialLookAt = new THREE.Vector3(3, 5, 5);
        const targetLookAt = new THREE.Vector3(0, 0, 0);

        let animStartTime: number | null = null;
        const transitionDuration = 2;
        let animationFrameId: number;

        const animate = (now: number) => {
            const time = clock.getElapsedTime();

            for (const p of particles) {
                const r = Math.sqrt(p.basePos.x ** 2 + p.basePos.z ** 2);
                const wave = Math.sin(r * 0.2 - time * waveSpeed) * waveHeight;
                p.mesh.position.y = wave;

                if (p.glow) {
                    p.glow.position.y = p.mesh.position.y;
                    const shouldGlow = wave > waveHeight * 0.7;
                    p.glowStrength += (shouldGlow ? 1 : 0 - p.glowStrength) * 0.12;
                    p.glowStrength = Math.max(0, Math.min(1, p.glowStrength));
                    (p.glow.material as THREE.SpriteMaterial).opacity = p.glowStrength * 0.6;
                    p.glow.visible = p.glowStrength > 0.02;
                }
                const glowUniform = (p.mesh.material as THREE.ShaderMaterial).uniforms['uGlowStrength'];
                if (glowUniform) {
                    glowUniform.value = p.glowStrength;
                }
            }

            mouse.x += (targetMouse.x - mouse.x) * mouseSmoothing;
            mouse.y += (targetMouse.y - mouse.y) * mouseSmoothing;

            if (animStartTime === null) animStartTime = now;
            const elapsed = (now - animStartTime) / 1000;
            let t = Math.min(elapsed / transitionDuration, 1);
            t = t * t * (3 - 2 * t);

            const camPos = new THREE.Vector3();
            camPos.lerpVectors(initialCamPos, targetCamPos, t);

            const camOffsetX = mouse.x * 20.0; // Allow wider horizontal panning
            const camOffsetY = mouse.y * 4.0;  // Restrict vertical panning

            camera.position.x = camPos.x + camOffsetX;
            // Prevent camera from going too low (minimum height of 6) to avoid clipping into particles
            camera.position.y = Math.max(6, camPos.y + camOffsetY);
            camera.position.z = camPos.z;

            const lookAtPos = new THREE.Vector3();
            lookAtPos.lerpVectors(initialLookAt, targetLookAt, t);
            camera.lookAt(lookAtPos);

            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };

        animationFrameId = requestAnimationFrame(animate);

        const handleResize = () => {
            if (!container) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(animationFrameId);
            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [resolvedTheme]);

    return (
        <div
            ref={mountRef}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                zIndex: 0,
                width: "100%",
                height: "100%",
            }}
        />
    );
}
