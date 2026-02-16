async function testEndpoints() {
	const baseUrl = "http://127.0.0.1:4069";
	
	const endpoints = [
		"/api/alerts",
		"/api/markets",
		"/api/alerts?category=CRYPTO",
		"/api/markets?close=true"
	];

	for (const endpoint of endpoints) {
		console.log(`
Testing ${endpoint}...`);
		
		// First call (cache miss)
		let start = Date.now();
		try {
			let res = await fetch(baseUrl + endpoint);
			let data = await res.json();
			let duration = Date.now() - start;
			console.log(`First call (cache miss): ${duration}ms, items: ${data.data?.length}`);
			
			// Second call (cache hit)
			start = Date.now();
			res = await fetch(baseUrl + endpoint);
			data = await res.json();
			duration = Date.now() - start;
			const cacheGen = res.headers.get("X-Cache-Generation");
			console.log(`Second call (cache hit): ${duration}ms, items: ${data.data?.length}, Cache-Gen: ${cacheGen}`);
		} catch (e) {
			console.error(`Failed to fetch ${endpoint}:`, e.message);
		}
	}
}

testEndpoints();
