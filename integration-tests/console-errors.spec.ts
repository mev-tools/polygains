import { expect, test } from "@playwright/test";

test.describe("Console Error Tests", () => {
	test("should not have dateFormatter ReferenceError", async ({ page }) => {
		const consoleErrors: string[] = [];
		const pageErrors: string[] = [];

		// Capture console errors
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});

		// Capture page errors
		page.on("pageerror", (error) => {
			pageErrors.push(error.message);
		});

		// Navigate to the page
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Wait a bit for any async scripts to run
		await page.waitForTimeout(2000);

		// Check for dateFormatter error specifically
		const allErrors = [...consoleErrors, ...pageErrors];
		const dateFormatterErrors = allErrors.filter((e) =>
			e.includes("dateFormatter"),
		);

		if (dateFormatterErrors.length > 0) {
			console.log("dateFormatter errors found:", dateFormatterErrors);
		}

		expect(dateFormatterErrors).toHaveLength(0);
	});

	test("should not have any ReferenceError", async ({ page }) => {
		const referenceErrors: string[] = [];

		page.on("pageerror", (error) => {
			if (error.message.includes("ReferenceError")) {
				referenceErrors.push(error.message);
			}
		});

		await page.goto("/");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		expect(referenceErrors).toHaveLength(0);
	});

	test("should capture all console messages for debugging", async ({ page }) => {
		const allConsoleMessages: { type: string; text: string }[] = [];

		page.on("console", (msg) => {
			allConsoleMessages.push({
				type: msg.type(),
				text: msg.text(),
			});
		});

		await page.goto("/");
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(2000);

		// Log all messages for debugging
		console.log("Console messages:", allConsoleMessages);

		// The test passes - this is for diagnostic purposes
		expect(true).toBe(true);
	});
});
