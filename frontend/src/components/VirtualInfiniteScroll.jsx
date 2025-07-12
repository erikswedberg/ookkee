import React, { useState, useEffect, useRef, useCallback } from 'react';
import './VirtualInfiniteScroll.css';

const VirtualInfiniteScroll = ({
  totalItems,
  itemHeight = 60,
  pageSize = 20,
  onRequestPage,
  ItemComponent, // React component instead of renderItem function
  itemProps = {}, // Additional props to pass to each item
  containerHeight = '400px',
  loadingComponent = null,
  headerComponent = null, // Optional header component
}) => {
  const [renderedPages, setRenderedPages] = useState({}); //'1': true
  const [pageData, setPageData] = useState({}); // Cache for page data
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollLock, setScrollLock] = useState(false);
  const [lastScrollPos, setLastScrollPos] = useState(0);
  const lastScrollPosRef = useRef(0);
  const [loadingPages, setLoadingPages] = useState(new Set()); // Track pages being loaded

  // Fixed page data arrays - always 20 items each, null for empty slots
  const [pageAData, setPageAData] = useState(Array(pageSize).fill(null));
  const [pageBData, setPageBData] = useState(Array(pageSize).fill(null));
  const [pageCData, setPageCData] = useState(Array(pageSize).fill(null));

  const [pageALoading, setPageALoading] = useState(false);
  const [pageBLoading, setPageBLoading] = useState(false);
  const [pageCLoading, setPageCLoading] = useState(false);

  // Track which page number each container is currently showing
  const [currentPageA, setCurrentPageA] = useState(-1);
  const [currentPageB, setCurrentPageB] = useState(-1);
  const [currentPageC, setCurrentPageC] = useState(-1);

  const containerRef = useRef(null);
  const virtualScrollRef = useRef(null);
  const listNodeA = useRef(null);
  const listNodeB = useRef(null);
  const listNodeC = useRef(null);
  const loadingNodeA = useRef(null);
  const loadingNodeB = useRef(null);
  const loadingNodeC = useRef(null);
  const pageWatchdogRef = useRef(null);

  const listNodes = [listNodeA, listNodeB, listNodeC];
  const loadingNodes = [loadingNodeA, loadingNodeB, loadingNodeC];

  // Calculate dimensions
  const pageHeight = pageSize * itemHeight;
  const totalHeight = totalItems * itemHeight;
  const maxPages = Math.ceil(totalItems / pageSize);
  const offset = 0; // Can be used for header offset

  // Convert scroll position to page number
  const getPageFromPosition = useCallback(
    pos => {
      const page = pos > 0 ? Math.floor(pos / pageHeight) + 1 : 1;
      return Math.max(1, Math.min(page, maxPages));
    },
    [pageHeight, maxPages]
  );

  // Convert page number to scroll position
  const getPositionFromPage = useCallback(
    page => {
      return pageHeight * (page - 1) + offset;
    },
    [pageHeight, offset]
  );

  // Get pages that should be visible at current scroll position
  const getPagesFromPosition = useCallback(
    pos => {
      const page = getPageFromPosition(pos);
      const pages = [page];

      // Check if next page should be visible
      const nextPage = page + 1;
      if (nextPage <= maxPages) {
        const nextPos = getPositionFromPage(nextPage);
        const viewportHeight = containerRef.current?.clientHeight || 400;

        if (nextPos > pos && nextPos < pos + viewportHeight) {
          pages.push(nextPage);
        }
      }

      // Check if previous page should be visible
      const prevPage = page - 1;
      if (prevPage >= 1) {
        const prevPos = getPositionFromPage(prevPage);
        const viewportHeight = containerRef.current?.clientHeight || 400;

        if (prevPos < pos + viewportHeight && prevPos > pos - pageHeight) {
          pages.unshift(prevPage);
        }
      }

      return pages;
    },
    [getPageFromPosition, getPositionFromPage, maxPages, pageHeight]
  );

  // Get scroll direction
  const getScrollDirection = useCallback(pos => {
    const direction = pos > lastScrollPosRef.current ? 'down' : 'up';
    lastScrollPosRef.current = pos;
    setLastScrollPos(pos);
    return direction;
  }, []);

  // Find available list node for rendering a page ("Follow the Yellow Brick Road")
  const getListNode = useCallback(
    page => {
      let returnNode = null;
      let activeIndex = 0;

      // First, check if this page is already rendered in a node
      for (let i = 0; i < listNodes.length; i++) {
        const node = listNodes[i].current;
        const thisPage = parseInt(node?.dataset.page || '0', 10);
        if (thisPage === page) {
          return { node, index: i };
        }
      }

      // Second, try to find an empty node
      for (let i = 0; i < listNodes.length; i++) {
        const node = listNodes[i].current;
        if (!node?.dataset.page || node.dataset.page === '') {
          activeIndex = i;
          returnNode = node;
          break;
        }
      }

      // If no empty node, find the furthest node from current page to recycle
      if (!returnNode) {
        let furthestDistance = 0;
        let furthestIndex = 0;

        for (let i = 0; i < listNodes.length; i++) {
          const node = listNodes[i].current;
          const thisPage = parseInt(node?.dataset.page || '0', 10);
          const distance = Math.abs(thisPage - page);

          if (distance > furthestDistance) {
            furthestDistance = distance;
            furthestIndex = i;
          }
        }

        activeIndex = furthestIndex;
        returnNode = listNodes[furthestIndex].current;

        // Clear the node before reuse (like emptyNode in original)
        if (returnNode) {
          returnNode.dataset.page = '';
        }
      }

      return { node: returnNode, index: activeIndex };
    },
    [listNodes]
  );

  // Show loading indicator for a page
  const showLoadingPage = useCallback(
    page => {
      // Find available loading node
      let loadingNode = null;
      for (let i = 0; i < loadingNodes.length; i++) {
        const node = loadingNodes[i].current;
        if (!node?.dataset.page) {
          loadingNode = node;
          break;
        }
      }

      if (loadingNode) {
        const loadingPos = getPositionFromPage(page) + pageHeight / 2 - 15;
        loadingNode.dataset.page = page;
        loadingNode.classList.add('active');
        loadingNode.style.top = `${loadingPos}px`;
      }
    },
    [getPositionFromPage, pageHeight, loadingNodes]
  );

  // Clear loading indicator for a page
  const clearLoadingPage = useCallback(
    page => {
      for (let i = 0; i < loadingNodes.length; i++) {
        const node = loadingNodes[i].current;
        if (node?.dataset.page === page.toString()) {
          node.dataset.page = '';
          node.classList.remove('active');
          node.style.top = '';
          break;
        }
      }
    },
    [loadingNodes]
  );

  const setAndClearRenderedPage = useCallback((page, oldPage) => {
    setRenderedPages(prev => {
      const newRenderedPages = { ...prev };
      // Remove the old page from renderedPages if it was recycled
      if (oldPage && oldPage !== page) {
        delete newRenderedPages[oldPage];
      }
      // Add the new page to renderedPages
      newRenderedPages[page] = true;

      return newRenderedPages;
    });
  }, []);

  // Display a page of data by updating React component props
  const displayPage = useCallback(
    (page, data) => {
      const { node, index } = getListNode(page);
      if (!node) return;

      // Set page data attribute for debugging
      node.dataset.page = page;

      // clear the node's content
      if (index === 0) {
        setPageALoading(true);
      } else if (index === 1) {
        setPageBLoading(true);
      } else if (index === 2) {
        setPageCLoading(true);
      }

      // Position the node
      const cssTop = getPositionFromPage(page);
      node.style.top = `${cssTop}px`;

      // Set height
      // if (page === maxPages) {
      //   node.style.height = 'auto';
      // } else {
      //   node.style.height = `${pageHeight}px`;
      // }

      // Update the appropriate page data state (triggers React re-render)
      const items = data || [];
      const paddedItems = items.concat(
        Array(pageSize - items.length).fill(null)
      );

      if (index === 0) {
        setPageAData(paddedItems);
        setCurrentPageA(page);
        setAndClearRenderedPage(page, currentPageA);
        setPageALoading(false);
      } else if (index === 1) {
        setPageBData(paddedItems);
        setCurrentPageB(page);
        setAndClearRenderedPage(page, currentPageB);
        setPageBLoading(false);
      } else if (index === 2) {
        setPageCData(paddedItems);
        setCurrentPageC(page);
        setAndClearRenderedPage(page, currentPageC);
        setPageCLoading(false);
      }
    },
    [
      getListNode,
      getPositionFromPage,
      maxPages,
      pageSize,
      pageHeight,
      setAndClearRenderedPage,
      currentPageA,
      currentPageB,
      currentPageC,
    ]
  );

  // Request a page of data
  const requestPage = useCallback(
    async page => {
      // If we have cached data, display it immediately
      if (pageData[page]) {
        displayPage(page, pageData[page]);
        //setRenderedPages(prev => ({ ...prev, [page]: true }));
        return;
      }

      // If page is already being loaded, don't load again
      if (loadingPages.has(page)) {
        return;
      }

      if (!onRequestPage) return;

      // Mark page as loading
      setLoadingPages(prev => new Set([...prev, page]));
      showLoadingPage(page);

      try {
        const data = await onRequestPage(page, pageSize);
        setPageData(prev => ({ ...prev, [page]: data }));

        // Mark page as rendered
        //setRenderedPages(prev => ({ ...prev, [page]: true }));

        // Clear loading indicator and remove from loading set
        clearLoadingPage(page);
        setLoadingPages(prev => {
          const newSet = new Set(prev);
          newSet.delete(page);
          return newSet;
        });

        // Display the page
        displayPage(page, data);
      } catch (error) {
        console.error('Error requesting page:', error);
        clearLoadingPage(page);
        setLoadingPages(prev => {
          const newSet = new Set(prev);
          newSet.delete(page);
          return newSet;
        });
      }
    },
    [
      pageData,
      loadingPages,
      onRequestPage,
      pageSize,
      showLoadingPage,
      clearLoadingPage,
      displayPage,
    ]
  );

  // Handle scroll events with aggressive pre-rendering
  const handleScroll = useCallback(() => {
    if (scrollLock) return;

    const pos = containerRef.current?.scrollTop || 0;
    const direction = getScrollDirection(pos);
    const page = getPageFromPosition(pos);

    setCurrentPage(page);
    setScrollLock(true);

    // Aggressive pre-rendering based on scroll direction
    if (direction === 'down') {
      const nextPage = page + 1;
      if (nextPage <= maxPages && !renderedPages[nextPage]) {
        requestPage(nextPage);
      }
    } else if (direction === 'up') {
      const prevPage = page - 1;
      if (prevPage >= 1 && !renderedPages[prevPage]) {
        requestPage(prevPage);
      }
    }

    // Unlock scroll after a shorter delay for more responsiveness
    setTimeout(() => {
      setScrollLock(false);
    }, 50);
  }, [
    scrollLock,
    getScrollDirection,
    getPageFromPosition,
    maxPages,
    renderedPages,
    requestPage,
  ]);

  // Page watchdog - aggressively checks which pages should be visible and requests them
  const pageWatchdog = useCallback(() => {
    if (scrollLock) return;

    const pos = containerRef.current?.scrollTop || 0;
    const pages = getPagesFromPosition(pos);

    // Request all visible pages
    pages.forEach(page => {
      if (!renderedPages[page] && page <= maxPages) {
        requestPage(page);
      }
    });

    // Aggressive pre-loading: load pages ahead in scroll direction
    // const currentPage = getPageFromPosition(pos);
    // const direction = getScrollDirection(pos);

    // if (direction === 'down') {
    //   // Pre-load 2 pages ahead when scrolling down
    //   for (let i = 1; i <= 2; i++) {
    //     const nextPage = currentPage + i;
    //     if (nextPage <= maxPages && !renderedPages[nextPage]) {
    //       requestPage(nextPage);
    //     }
    //   }
    // } else if (direction === 'up') {
    //   // Pre-load 2 pages behind when scrolling up
    //   for (let i = 1; i <= 2; i++) {
    //     const prevPage = currentPage - i;
    //     if (prevPage >= 1 && !renderedPages[prevPage]) {
    //       requestPage(prevPage);
    //     }
    //   }
    // }
  }, [scrollLock, getPagesFromPosition, renderedPages, maxPages, requestPage]);

  // Set up container ref to point to parent scrolling container
  useEffect(() => {
    const virtualScrollDiv = virtualScrollRef.current;
    if (!virtualScrollDiv) return;

    // Point containerRef to the parent scrolling container
    containerRef.current = virtualScrollDiv.parentElement;
  }, []);

  // Set up scroll listener and page watchdog
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);

    // Start page watchdog (more aggressive like original - 500ms)
    pageWatchdogRef.current = setInterval(pageWatchdog, 500);

    // Initial page request
    if (!pageData[1]) {
      requestPage(1);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (pageWatchdogRef.current) {
        clearInterval(pageWatchdogRef.current);
      }
    };
  }, [handleScroll, pageWatchdog, requestPage, pageData]);

  // Loading component or default
  const LoadingComponent =
    loadingComponent ||
    (() => (
      <div className="virtual-scroll-loading">
        <div className="loading-spinner"></div>
      </div>
    ));

  return (
    <>
      {headerComponent && (
        <div className="scroll-table sticky top-0 z-10">
          <div className="scroll-table-header-group">{headerComponent}</div>
        </div>
      )}

      <div ref={virtualScrollRef} className="virtual-infinite-scroll">
        {/* Container with full height to maintain scrollbar proportions */}

        <div
          className="virtual-scroll-container"
          style={{ height: `${totalHeight}px`, position: 'relative' }}
        >
          {/* Render header if provided */}

          {/* Three pages with fixed React components using CSS display: table-row-group */}
          <div
            ref={listNodeA}
            className="virtual-scroll-page scroll-page-a virtual-table-body"
            data-page=""
          >
            <div className="scroll-table">
              {Array(pageSize)
                .fill(null)
                .map((_, index) => (
                  <ItemComponent
                    key={`page-a-${index}`}
                    expense={pageAData[index]}
                    expenseIndex={(currentPageA - 1) * pageSize + index}
                    isVisible={pageAData[index] !== null}
                    isLoading={pageALoading}
                    {...itemProps}
                  />
                ))}
            </div>
          </div>
          <div
            ref={listNodeB}
            className="virtual-scroll-page scroll-page-b virtual-table-body"
            data-page=""
          >
            <div className="scroll-table">
              {Array(pageSize)
                .fill(null)
                .map((_, index) => (
                  <ItemComponent
                    key={`page-b-${index}`}
                    expense={pageBData[index]}
                    expenseIndex={(currentPageB - 1) * pageSize + index}
                    isVisible={pageBData[index] !== null}
                    isLoading={pageBLoading}
                    {...itemProps}
                  />
                ))}
            </div>
          </div>
          <div
            ref={listNodeC}
            className="virtual-scroll-page scroll-page-c virtual-table-body"
            data-page=""
          >
            <div className="scroll-table">
              {Array(pageSize)
                .fill(null)
                .map((_, index) => (
                  <ItemComponent
                    key={`page-c-${index}`}
                    expense={pageCData[index]}
                    expenseIndex={(currentPageC - 1) * pageSize + index}
                    isVisible={pageCData[index] !== null}
                    isLoading={pageCLoading}
                    {...itemProps}
                  />
                ))}
            </div>
          </div>

          {/* Loading indicators */}
          <div
            ref={loadingNodeA}
            className="virtual-scroll-loading"
            data-page=""
          >
            <LoadingComponent />
          </div>
          <div
            ref={loadingNodeB}
            className="virtual-scroll-loading"
            data-page=""
          >
            <LoadingComponent />
          </div>
          <div
            ref={loadingNodeC}
            className="virtual-scroll-loading"
            data-page=""
          >
            <LoadingComponent />
          </div>
        </div>
        {/* </div> */}
        {/* Debug info - disabled - `process.env.NODE_ENV === 'development' &&` */}
        {false && (
          <div className="virtual-scroll-debug">
            <div>Current Page: {currentPage}</div>
            <div>Total Pages: {maxPages}</div>
            <div>Rendered Pages: {Object.keys(renderedPages).join(', ')}</div>
            <div>Cached Pages: {Object.keys(pageData).join(', ')}</div>
            <div>Loading Pages: {Array.from(loadingPages).join(', ')}</div>
            <div>Scroll Position: {lastScrollPos}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default VirtualInfiniteScroll;
