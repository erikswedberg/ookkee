import React, { useState, useEffect, useRef, useCallback } from 'react';
import './VirtualInfiniteScroll.css';

const VirtualInfiniteScroll = ({
  totalItems,
  itemHeight = 46,
  pageSize = 20,
  onRequestPage,
  renderItem,
  containerHeight = '400px',
  loadingComponent = null
}) => {
  const [renderedPages, setRenderedPages] = useState({ 1: true });
  const [pageData, setPageData] = useState({}); // Cache for page data
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollLock, setScrollLock] = useState(false);
  const [lastScrollPos, setLastScrollPos] = useState(0);
  
  const containerRef = useRef(null);
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
  const getPageFromPosition = useCallback((pos) => {
    const page = pos > 0 ? Math.floor(pos / pageHeight) + 1 : 1;
    return Math.max(1, Math.min(page, maxPages));
  }, [pageHeight, maxPages]);
  
  // Convert page number to scroll position
  const getPositionFromPage = useCallback((page) => {
    return (pageHeight * (page - 1)) + offset;
  }, [pageHeight, offset]);
  
  // Get pages that should be visible at current scroll position
  const getPagesFromPosition = useCallback((pos) => {
    const page = getPageFromPosition(pos);
    const pages = [page];
    
    // Check if next page should be visible
    const nextPage = page + 1;
    if (nextPage <= maxPages) {
      const nextPos = getPositionFromPage(nextPage);
      const viewportHeight = containerRef.current?.clientHeight || 400;
      
      if (nextPos > pos && nextPos < (pos + viewportHeight)) {
        pages.push(nextPage);
      }
    }
    
    // Check if previous page should be visible
    const prevPage = page - 1;
    if (prevPage >= 1) {
      const prevPos = getPositionFromPage(prevPage);
      const viewportHeight = containerRef.current?.clientHeight || 400;
      
      if (prevPos < (pos + viewportHeight) && prevPos > (pos - pageHeight)) {
        pages.unshift(prevPage);
      }
    }
    
    return pages;
  }, [getPageFromPosition, getPositionFromPage, maxPages, pageHeight]);
  
  // Get scroll direction
  const getScrollDirection = useCallback((pos) => {
    const direction = pos > lastScrollPos ? 'down' : 'up';
    setLastScrollPos(pos);
    return direction;
  }, [lastScrollPos]);
  
  // Find available list node for rendering a page ("Follow the Yellow Brick Road")
  const getListNode = useCallback((page) => {
    let returnNode = null;
    let activeIndex = 0;
    
    // First, try to find an empty node
    for (let i = 0; i < listNodes.length; i++) {
      const node = listNodes[i].current;
      if (!node?.dataset.page) {
        activeIndex = i;
        returnNode = node;
        break;
      }
    }
    
    // If no empty node, find the furthest node from current page
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
    }
    
    return { node: returnNode, index: activeIndex };
  }, [listNodes]);
  
  // Show loading indicator for a page
  const showLoadingPage = useCallback((page) => {
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
      const loadingPos = getPositionFromPage(page) + (pageHeight / 2) - 15;
      loadingNode.dataset.page = page;
      loadingNode.classList.add('active');
      loadingNode.style.top = `${loadingPos}px`;
    }
  }, [getPositionFromPage, pageHeight, loadingNodes]);
  
  // Clear loading indicator for a page
  const clearLoadingPage = useCallback((page) => {
    for (let i = 0; i < loadingNodes.length; i++) {
      const node = loadingNodes[i].current;
      if (node?.dataset.page === page.toString()) {
        node.dataset.page = '';
        node.classList.remove('active');
        node.style.top = '';
        break;
      }
    }
  }, [loadingNodes]);
  
  // Request a page of data
  const requestPage = useCallback(async (page) => {
    // If we have cached data, display it immediately
    if (pageData[page]) {
      displayPage(page, pageData[page]);
      setRenderedPages(prev => ({ ...prev, [page]: true }));
      return;
    }
    
    if (!onRequestPage) return;
    
    showLoadingPage(page);
    
    try {
      const data = await onRequestPage(page, pageSize);
      setPageData(prev => ({ ...prev, [page]: data }));
      
      // Mark page as rendered
      setRenderedPages(prev => ({ ...prev, [page]: true }));
      
      // Clear loading indicator
      clearLoadingPage(page);
      
      // Display the page
      displayPage(page, data);
    } catch (error) {
      console.error('Error requesting page:', error);
      clearLoadingPage(page);
    }
  }, [pageData, onRequestPage, pageSize, showLoadingPage, clearLoadingPage, displayPage]);
  
  // Display a page of data in the appropriate list node
  const displayPage = useCallback((page, data) => {
    const { node, index } = getListNode(page);
    if (!node) return;
    
    // Set page data attribute
    node.dataset.page = page;
    
    // Position the node
    const cssTop = getPositionFromPage(page);
    node.style.top = `${cssTop}px`;
    
    // Set height
    if (page === maxPages) {
      node.style.height = 'auto';
    } else {
      node.style.height = `${pageHeight}px`;
    }
    
    // Add page coloring for debugging
    const pageColors = ['skyblue', 'gold', 'indianred'];
    node.style.backgroundColor = pageColors[index % 3];
    node.style.opacity = '0.1';
    
    // Render items
    const items = data || [];
    const itemElements = items.map((item, index) => {
      const globalIndex = (page - 1) * pageSize + index;
      return renderItem(item, globalIndex);
    });
    
    // Clear and populate the node
    node.innerHTML = '';
    itemElements.forEach(element => {
      if (typeof element === 'string') {
        node.insertAdjacentHTML('beforeend', element);
      } else if (element instanceof HTMLElement) {
        node.appendChild(element);
      }
    });
  }, [getListNode, getPositionFromPage, pageHeight, maxPages, pageSize, renderItem]);
  
  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (scrollLock) return;
    
    const pos = containerRef.current?.scrollTop || 0;
    const direction = getScrollDirection(pos);
    const page = getPageFromPosition(pos);
    
    setCurrentPage(page);
    setScrollLock(true);
    
    // Unlock scroll after a delay
    setTimeout(() => {
      setScrollLock(false);
    }, 100);
  }, [scrollLock, getScrollDirection, getPageFromPosition]);
  
  // Page watchdog - checks which pages should be visible and requests them
  const pageWatchdog = useCallback(() => {
    if (scrollLock) return;
    
    const pos = containerRef.current?.scrollTop || 0;
    const pages = getPagesFromPosition(pos);
    
    pages.forEach(page => {
      if (!renderedPages[page] && page <= maxPages) {
        requestPage(page);
      }
    });
  }, [scrollLock, getPagesFromPosition, renderedPages, maxPages, requestPage]);
  
  // Set up scroll listener and page watchdog
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll);
    
    // Start page watchdog
    pageWatchdogRef.current = setInterval(pageWatchdog, 1000);
    
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
  const LoadingComponent = loadingComponent || (() => (
    <div className="virtual-scroll-loading">
      <div className="loading-spinner"></div>
    </div>
  ));
  
  return (
    <div 
      ref={containerRef}
      className="virtual-infinite-scroll"
      style={{ height: containerHeight, overflow: 'auto', position: 'relative' }}
    >
      {/* Container with full height to maintain scrollbar proportions */}
      <div 
        className="virtual-scroll-container"
        style={{ height: `${totalHeight}px`, position: 'relative' }}
      >
        {/* Three list nodes for page cycling */}
        <div ref={listNodeA} className="virtual-scroll-page" data-page=""></div>
        <div ref={listNodeB} className="virtual-scroll-page" data-page=""></div>
        <div ref={listNodeC} className="virtual-scroll-page" data-page=""></div>
        
        {/* Loading indicators */}
        <div ref={loadingNodeA} className="virtual-scroll-loading" data-page="">
          <LoadingComponent />
        </div>
        <div ref={loadingNodeB} className="virtual-scroll-loading" data-page="">
          <LoadingComponent />
        </div>
        <div ref={loadingNodeC} className="virtual-scroll-loading" data-page="">
          <LoadingComponent />
        </div>
      </div>
      
      {/* Debug info - can be removed */}
      {process.env.NODE_ENV === 'development' && (
        <div className="virtual-scroll-debug">
          <div>Current Page: {currentPage}</div>
          <div>Total Pages: {maxPages}</div>
          <div>Rendered Pages: {Object.keys(renderedPages).join(', ')}</div>
          <div>Cached Pages: {Object.keys(pageData).join(', ')}</div>
        </div>
      )}
    </div>
  );
};

export default VirtualInfiniteScroll;
