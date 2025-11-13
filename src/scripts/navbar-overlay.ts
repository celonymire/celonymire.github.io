import { PAGES } from "@lib/constants";

import gsap from "gsap";
import { Application, Container, Graphics, Text } from "pixi.js";

interface Particle {
	g: Graphics;
	nx: number;
	ny: number;
	vx: number;
	vy: number;
	targetAlpha: number;
}

const NUM_LAYERS = 3;
const PAGE_NODE_DIST = 300;

function createParticleBackground(app: Application, particleCount = 150) {
	const particleContainer = new Container();
	app.stage.addChild(particleContainer);

	const particles: Particle[] = [];

	const width = app.canvas.width;
	const height = app.canvas.height;
	for (let i = 0; i < particleCount; i++) {
		const g = new Graphics();
		const size = Math.random() * 2 + 0.5;
		g.circle(0, 0, size).fill(0xffffff);

		// Normalized coordinates
		const nx = Math.random();
		const ny = Math.random();
		const vx = (Math.random() - 0.5) * 0.001;
		const vy = (Math.random() - 0.5) * 0.001;
		const targetAlpha = Math.random() * 0.6 + 0.2;

		g.position.set(nx * width, ny * height);
		g.alpha = Math.random() * 0.5 + 0.2;

		particleContainer.addChild(g);

		particles.push({
			g,
			nx,
			ny,
			vx,
			vy,
			targetAlpha,
		});
	}

	// Animate particles with normalized space mapping
	app.ticker.add(() => {
		const width = app.canvas.width;
		const height = app.canvas.height;

		particles.forEach((p) => {
			p.nx += p.vx;
			p.ny += p.vy;

			if (p.nx < 0) p.nx += 1;
			if (p.nx > 1) p.nx -= 1;
			if (p.ny < 0) p.ny += 1;
			if (p.ny > 1) p.ny -= 1;

			// Map to pixel coordinates every frame using current canvas size
			p.g.x = p.nx * width;
			p.g.y = p.ny * height;

			// Subtle alpha pulsing
			const alpha = p.g.alpha;
			const newAlpha = alpha + (p.targetAlpha - alpha) * 0.02;
			p.g.alpha = newAlpha;
			if (Math.abs(p.targetAlpha - alpha) < 0.01) {
				p.targetAlpha = Math.random() * 0.6 + 0.2;
			}
		});
	});

	return particleContainer;
}

function createCobwebLayers(container: Container, rotGap: number) {
	const layerTl = gsap.timeline();
	layerTl.delay(1);

	for (let i = 0; i < NUM_LAYERS; i++) {
		const dist = (i + 1) * (PAGE_NODE_DIST / NUM_LAYERS);
		const points = [];

		for (let j = 0; j < PAGES.length; j++) {
			const angle = j * rotGap - Math.PI / 2;
			// Draw relative to (0,0); parent container will be centered
			const x = Math.cos(angle) * dist;
			const y = Math.sin(angle) * dist;
			points.push(x, y);
		}

		const layerG = new Graphics();
		layerG.alpha = 0;
		layerG.poly(points).stroke({ width: 2, color: "white" });
		container.addChild(layerG);

		layerTl.to(layerG, { alpha: 1, duration: 0.5 });
	}

	return layerTl;
}

function createPageNode(container: Container, pageIndex: number, vx: number, vy: number, currentPage: string) {
	const page = PAGES[pageIndex];
	const nodeContainer = new Container();

	const lineG = new Graphics();
	// Lines drawn from center (0,0) to the node vector (vx,vy)
	lineG.moveTo(0, 0);
	lineG.lineTo(vx, vy).stroke({ width: 4, color: "white" });
	nodeContainer.addChild(lineG);

	const circleG = new Graphics();
	const isActive = page.link === currentPage;
	circleG.circle(0, 0, 100).fill(isActive ? "yellow" : "white");
	circleG.position.set(vx, vy);
	circleG.scale.set(1);
	nodeContainer.addChild(circleG);

	container.addChild(nodeContainer);

	// Add centered label as child of node container so it stays with the circle
	const text = new Text({
		text: page.title,
		style: { fill: "black", fontSize: 16 },
		anchor: 0.5,
		position: { x: vx, y: vy },
	});
	nodeContainer.addChild(text);

	// Add interactivity only for non-active pages
	if (!isActive) {
		nodeContainer.eventMode = "static";
		nodeContainer.on("pointerover", () => {
			gsap.to(circleG.scale, { x: 1.15, y: 1.15, duration: 0.2 });
			gsap.to(text.scale, { x: 1.15, y: 1.15, duration: 0.2 });
		});
		nodeContainer.on("pointerout", () => {
			gsap.to(circleG.scale, { x: 1, y: 1, duration: 0.2 });
			gsap.to(text.scale, { x: 1, y: 1, duration: 0.2 });
		});
		nodeContainer.on("pointertap", () => {
			window.location.href = page.link;
		});
	}

	return { nodeContainer, text };
}

export class Navbar {
	private app: Application;
	private container: Container;
	private ctx?: gsap.Context;

	private constructor(app: Application, container: Container) {
		this.app = app;
		this.container = container;
	}

	static async create(root: HTMLElement): Promise<Navbar> {
		const app = new Application();
		await app.init({ resizeTo: root });
		root.appendChild(app.canvas);

		createParticleBackground(app);

		const g = new Container();
		app.stage.addChild(g);

		const navbar = new Navbar(app, g);
		navbar.updateCenter();
		return navbar;
	}

	rebuild(currentPage?: string) {
		const page = currentPage ?? window.location.pathname;

		// Revert previous animations and clear container
		if (this.ctx) this.ctx.revert();
		this.container.removeChildren();

		this.ctx = gsap.context(() => {
			const rotGap = (2 * Math.PI) / PAGES.length;
			createCobwebLayers(this.container, rotGap);

			for (let i = 0; i < PAGES.length; i++) {
				const angle = i * rotGap - Math.PI / 2;
				const vx = Math.cos(angle) * PAGE_NODE_DIST;
				const vy = Math.sin(angle) * PAGE_NODE_DIST;

				createPageNode(this.container, i, vx, vy, page);
			}
		});
	}

	start() {
		this.app.stage.visible = true;
		this.app.ticker.start();
		this.updateCenter();
	}

	stop() {
		this.app.ticker.stop();
		this.app.stage.visible = false;
	}

	destroy() {
		if (this.ctx) this.ctx.revert();
		this.app.ticker.stop();
		this.app.destroy();
		if (this.app.canvas?.parentNode) {
			this.app.canvas.remove();
		}
	}

	private updateCenter() {
		this.container.position.set(this.app.canvas.width / 2, this.app.canvas.height / 2);
	}
}

// FIXME: Re-enable navbar overlay functionality for production once finalized
// document.addEventListener("DOMContentLoaded", async () => {
// 	const overlay = document.getElementById("navbar-overlay")!;
// 	const icon = document.getElementById("navbar-icon")!;
// 	let overlayOpen = false;

// 	const navbar = await Navbar.create(overlay);

// 	function openOverlay() {
// 		overlay.classList.add("navbar-canvas-open");
// 		navbar.rebuild(window.location.pathname);
// 		navbar.start();
// 	}

// 	function closeOverlay() {
// 		overlay.classList.remove("navbar-canvas-open");
// 		navbar.stop();
// 	}

// 	icon.addEventListener("click", () => {
// 		if (!overlayOpen) openOverlay();
// 		else closeOverlay();
// 		overlayOpen = !overlayOpen;
// 	});
// });
