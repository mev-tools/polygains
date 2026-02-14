import { describe, expect, test } from "bun:test";
import { SIDE } from "@/lib/models";
import { InsiderDetector } from "@/services/insider";
import { NotInsiderDetector } from "@/services/notinsider";
import { InsiderEvaluator, PolymarketPipe } from "@/services/pipe";

function buildPipeForUnitTest() {
	const pipe = new PolymarketPipe({ number: 1 });
	const insiderDetector = new InsiderDetector();
	const notInsiderDetector = new NotInsiderDetector();
	const anyPipe = pipe as any;

	anyPipe.insiderDetector = insiderDetector;
	anyPipe.notInsiderDetector = notInsiderDetector;
	anyPipe.insiderCount = 0;
	anyPipe.notInsiderCount = 0;
	anyPipe.evaluator = new InsiderEvaluator(
		insiderDetector,
		notInsiderDetector,
		() => anyPipe.insiderCount++,
		() => anyPipe.notInsiderCount++,
	);
	anyPipe.initialized = true;
	anyPipe.persistor = {
		onBatchProcessed: () => { },
	};
	anyPipe.stateFile = Bun.file(
		`/tmp/poly-sqd-ts-pipe-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
	);

	return { pipe, insiderDetector, notInsiderDetector };
}

describe("PolymarketPipe classification window", () => {
	test("marks sub-4k trader as non-insider when only post-window trades push total above threshold", async () => {
		const { pipe, insiderDetector, notInsiderDetector } = buildPipeForUnitTest();
		const trader = "0x1111111111111111111111111111111111111111";

		const firstBatchOrder = {
			trader,
			assetId: "token-1",
			usdc: 3_000_000_000n, // $3k
			shares: 3_000_000_000n, // price = 1.0 (> 0.95)
			side: SIDE.BUY,
			timestamp: 1_000,
		};

		const postWindowOrder = {
			trader,
			assetId: "token-1",
			usdc: 2_000_000_000n, // $2k, but outside first 15 minutes
			shares: 2_000_000_000n,
			side: SIDE.BUY,
			timestamp: 2_000, // 1000s later (> 900s window)
		};

		const batches = [
			{
				ctx: { state: { current: { number: 1, timestamp: 1_000 } } },
				data: [firstBatchOrder],
			},
			{
				ctx: { state: { current: { number: 2, timestamp: 2_000 } } },
				data: [postWindowOrder],
			},
		];

		const read = async function* () {
			for (const batch of batches) {
				yield batch;
			}
		};

		await pipe.write({
			logger: { error: () => {} },
			read,
		});

		expect(insiderDetector.has(trader)).toBe(false);
		expect(notInsiderDetector.has(trader)).toBe(true);
	});
});
