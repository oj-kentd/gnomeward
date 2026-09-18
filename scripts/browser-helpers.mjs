/** Enter through the same landing-page control a player uses. Returning players
 * with an active co-op session may enter automatically without clicking. */
export async function enterGarden(page) {
  await page.waitForFunction(() => {
    const play = document.getElementById('splash-play');
    return !!window.gnomeward || !!play && !play.disabled && play.getClientRects().length > 0;
  });
  if (await page.evaluate(() => !!window.gnomeward)) return false;
  await page.locator('#splash-play').click();
  return true;
}
