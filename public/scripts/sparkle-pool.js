/* sparkle-pool.js
 * Pool-based sparkle generator for avatar-cam.
 * Uses a small DOM pool and the Web Animations API for efficient animations.
 */

const POOL_SIZE = 8;
const BORDER_WIDTH = 10;
const SPARKLE_SIDE_LENGTH = 60;
const FADE_SECONDS = 0.5;
const DURATION_MS = FADE_SECONDS * 2 * 1000; // fade-in + fade-out

const SPARKLE_SRC = "https://img.icons8.com/?size=100&id=qdQpy48X3Rjv&format=png&color=000000";

let avatarCamDiv = null;
let pool = [];
let sparkleWorker = null;
let started = false;
let fallbackIntervalId = null; // module-scoped fallback for setInterval

function createPool(container) {
	for (let i = 0; i < POOL_SIZE; i++) {
		const img = document.createElement("img");
		img.src = SPARKLE_SRC;
		img.classList.add("shiny-star");
		img.style.position = "absolute";
		img.style.width = `${SPARKLE_SIDE_LENGTH}px`;
		img.style.height = `${SPARKLE_SIDE_LENGTH}px`;
		img.style.pointerEvents = "none";
		img.style.zIndex = "2";
		img.style.visibility = "hidden";
		img.style.left = "0px";
		img.style.top = "0px";
		img.style.transform = `translate3d(-9999px, -9999px, 0)`;

		container.appendChild(img);
		pool.push({ el: img, busy: false, anim: null, createdAt: Date.now() });
	}
}

function getFreeSlot() {
	return pool.find((p) => !p.busy);
}

function spawnSparkleAt(x, y) {
	const slot = getFreeSlot();
	if (!slot) {
		// No free slot, skip for now (avoids piling up). Could reuse oldest slot if desired.
		return;
	}
	const el = slot.el;
	slot.busy = true;

	// Place using transform to avoid layout reflow
	el.style.transform = `translate3d(${x - SPARKLE_SIDE_LENGTH / 2}px, ${y - SPARKLE_SIDE_LENGTH / 2}px, 0)`;
	el.style.visibility = "visible";

	if (el.animate) {
		// Web Animations API for precise control
		const anim = el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
			duration: DURATION_MS,
			easing: "ease-in-out",
			fill: "forwards",
		});

		slot.anim = anim;

		anim.finished
			.then(() => {
				slot.busy = false;
				slot.anim = null;
				el.style.visibility = "hidden";
				el.style.transform = `translate3d(-9999px, -9999px, 0)`;
			})
			.catch(() => {
				// Cancelled / interrupted
				slot.busy = false;
				slot.anim = null;
				el.style.visibility = "hidden";
				el.style.transform = `translate3d(-9999px, -9999px, 0)`;
			});
	} else {
		// Fallback to CSS classes if Web Animations API is not available
		el.style.transition = `opacity ${DURATION_MS / 2}ms ease-in-out`;
		el.style.opacity = "1";
		setTimeout(() => {
			el.style.opacity = "0";
			setTimeout(() => {
				slot.busy = false;
				el.style.visibility = "hidden";
				el.style.transform = `translate3d(-9999px, -9999px, 0)`;
			}, DURATION_MS / 2);
		}, DURATION_MS / 2);
	}
}

function spawnRandomEdgeSparkle() {
	const width = avatarCamDiv.clientWidth;
	const height = avatarCamDiv.clientHeight;

	const side = Math.floor(Math.random() * 4);
	let x, y;
	switch (side) {
		case 0: // top
			x = BORDER_WIDTH + Math.random() * width - SPARKLE_SIDE_LENGTH / 2;
			y = -BORDER_WIDTH - SPARKLE_SIDE_LENGTH / 2;
			break;
		case 1: // right
			x = BORDER_WIDTH + width - BORDER_WIDTH / 2 - SPARKLE_SIDE_LENGTH / 2;
			y = BORDER_WIDTH + Math.random() * height - SPARKLE_SIDE_LENGTH / 2;
			break;
		case 2: // bottom
			x = BORDER_WIDTH + Math.random() * width - SPARKLE_SIDE_LENGTH / 2;
			y = BORDER_WIDTH + height - SPARKLE_SIDE_LENGTH / 2;
			break;
		case 3: // left
			x = -BORDER_WIDTH - SPARKLE_SIDE_LENGTH / 2;
			y = BORDER_WIDTH + Math.random() * height - SPARKLE_SIDE_LENGTH / 2;
			break;
	}

	// Positions are relative to the container here.
	const localX = x; // x relative to container
	const localY = y; // y relative to container

	spawnSparkleAt(localX + SPARKLE_SIDE_LENGTH / 2, localY + SPARKLE_SIDE_LENGTH / 2);
}

function startSparkles({ interval = 250 } = {}) {
	if (started) return;
	started = true;

	if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		// Respect reduced motion preference
		return;
	}

	avatarCamDiv = document.getElementById("avatar-cam");
	if (!avatarCamDiv) return;

	createPool(avatarCamDiv);

	// Create and start worker
	try {
		sparkleWorker = new Worker("/scripts/interval-notifier-worker.js");
		sparkleWorker.onmessage = (e) => {
			if (e.data.type === "interval") {
				spawnRandomEdgeSparkle();
			}
		};

		// match previous behavior: start after 500ms
		setTimeout(() => {
			sparkleWorker.postMessage({ type: "start", data: { interval } });
		}, 500);
	} catch (e) {
		// If worker fails (e.g., served from file URLs during dev), fallback to setInterval
		setTimeout(() => {
			fallbackIntervalId = setInterval(() => spawnRandomEdgeSparkle(), interval);
		}, 500);
	}

	// Terminate worker on unload
	window.addEventListener("beforeunload", () => {
		if (sparkleWorker) {
			sparkleWorker.postMessage({ type: "stop" });
			sparkleWorker.terminate();
		}
	});
}

function init() {
	// Start when there is a container available
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => startSparkles({ interval: 250 }));
	} else {
		startSparkles({ interval: 250 });
	}
}

// Initialize automatically when the script is loaded
init();

// Expose start/stop for debugging
export function start() {
	startSparkles({ interval: 250 });
}
export function stop() {
	if (sparkleWorker) {
		sparkleWorker.postMessage({ type: "stop" });
		sparkleWorker.terminate();
		sparkleWorker = null;
	}
	if (fallbackIntervalId) {
		clearInterval(fallbackIntervalId);
		fallbackIntervalId = null;
	}
	pool.forEach((p) => {
		if (p.anim && p.anim.cancel) p.anim.cancel();
		p.el.style.visibility = "hidden";
		p.el.style.transform = `translate3d(-9999px, -9999px, 0)`;
		p.busy = false;
		p.anim = null;
	});
	started = false;
}
