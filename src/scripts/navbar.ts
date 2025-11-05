import { PAGES } from "@lib/constants";

import gsap from "gsap";
import { Application, Container, Graphics, Text } from "pixi.js";

const NUM_LAYERS = 3;
const PAGE_NODE_DIST = 300;

function createParticleBackground(app: Application, particleCount = 150) {
	const particleContainer = new Container();
	app.stage.addChild(particleContainer);

	const particles: Array<{ graphic: Graphics; vx: number; vy: number; alpha: number; targetAlpha: number }> = [];

	for (let i = 0; i < particleCount; i++) {
		const particle = new Graphics();
		const size = Math.random() * 2 + 0.5;
		particle.circle(0, 0, size).fill(0xffffff);
		particle.position.set(Math.random() * app.canvas.width, Math.random() * app.canvas.height);
		particle.alpha = Math.random() * 0.5 + 0.2;

		particleContainer.addChild(particle);

		particles.push({
			graphic: particle,
			vx: (Math.random() - 0.5) * 0.3,
			vy: (Math.random() - 0.5) * 0.3,
			alpha: particle.alpha,
			targetAlpha: Math.random() * 0.6 + 0.2,
		});
	}

	// Animate particles
	app.ticker.add(() => {
		particles.forEach((p) => {
			p.graphic.x += p.vx;
			p.graphic.y += p.vy;

			// Wrap around screen edges
			if (p.graphic.x < 0) p.graphic.x = app.canvas.width;
			if (p.graphic.x > app.canvas.width) p.graphic.x = 0;
			if (p.graphic.y < 0) p.graphic.y = app.canvas.height;
			if (p.graphic.y > app.canvas.height) p.graphic.y = 0;

			// Subtle alpha pulsing
			p.alpha += (p.targetAlpha - p.alpha) * 0.02;
			if (Math.abs(p.targetAlpha - p.alpha) < 0.01) {
				p.targetAlpha = Math.random() * 0.6 + 0.2;
			}
			p.graphic.alpha = p.alpha;
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
	private root: HTMLElement;
	private app: Application;
	private container: Container;
	private ctx?: gsap.Context;
	private resizeObserver?: ResizeObserver;

	private constructor(root: HTMLElement, app: Application, container: Container) {
		this.root = root;
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

		const navbar = new Navbar(root, app, g);
		navbar.updateCenter();
		navbar.observeRootResize();
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
		this.app.renderer.resize(this.root.clientWidth, this.root.clientHeight);
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
		if (this.resizeObserver) this.resizeObserver.disconnect();
	}

	private updateCenter() {
		this.container.position.set(this.app.canvas.width / 2, this.app.canvas.height / 2);
	}

	private observeRootResize() {
		if (this.resizeObserver) return;
		this.resizeObserver = new ResizeObserver(() => {
			this.app.renderer.resize(this.root.clientWidth, this.root.clientHeight);
			this.updateCenter();
		});
		this.resizeObserver.observe(this.root);
	}
}

(async () => {
	const overlay = document.getElementById("navbar-overlay")!;
	const icon = document.getElementById("navbar-icon")!;
	let overlayOpen = false;

	const navbar = await Navbar.create(overlay);

	function openOverlay() {
		overlay.classList.add("navbar-canvas-open");
		navbar.rebuild(window.location.pathname);
		navbar.start();
	}

	function closeOverlay() {
		overlay.classList.remove("navbar-canvas-open");
		navbar.stop();
	}

	icon.addEventListener("click", () => {
		if (!overlayOpen) openOverlay();
		else closeOverlay();
		overlayOpen = !overlayOpen;
	});
})();
