let interval = 500;
let running = false;

self.onmessage = (e) => {
	const { type, data } = e.data;

	switch (type) {
		case "start":
			if (!running) {
				running = true;
				interval = data?.interval || 500;
				notify();
			}
			break;
		case "stop":
			running = false;
			break;
		case "setInterval":
			interval = data?.interval || 500;
			break;
	}
};

async function notify() {
	while (running) {
		self.postMessage({ type: "interval" });
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}
