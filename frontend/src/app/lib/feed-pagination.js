function nextFeedCursor(page, currentCursor) {
  return page.length === 0 ? currentCursor : page[page.length - 1].id;
}

module.exports = { nextFeedCursor };
