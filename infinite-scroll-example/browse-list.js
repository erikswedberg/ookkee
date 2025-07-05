define(function (require) {
    var $ = require('jquery'),
    historyjs = require('history'),
    nunjucks = require('nunjucks'),
    env = require('app/template-filters'),
    underscore = require('underscore'),
    EventEmitter2 = require('eventemitter2'),
    Utility = require('app/widgets/common/utility'),
    templateHTML = require('text!app/widgets/common/browse-list.html'),
    listItemHTML = require('text!app/widgets/common/browse-list-item.html');

    //wf = require('webfont'),

    var template = new nunjucks.Template(templateHTML, env);
    var listItemTemplate = new nunjucks.Template(listItemHTML, env);

    var utility = new Utility();

    var BrowseList = function () {};
    var pfpCounter = 1;

    BrowseList.prototype = new EventEmitter2({maxListeners: 1000});

    BrowseList.prototype.init = function (opts, initCallback) {
        //traceLabel = "browse-list.js::init";

        _.defaults(opts, {
            fonts: {},
            initState: {}
        });
        // utility.trace(this.config, traceLabel, 'this.config');
        var offset = 80;
        //if (this.config == 'survey') {
        //    offset = 117;  // SET FOR FONTSURVEY
        //}

        _.extend(this, opts, {
            domNode: document.getElementById(opts.id),
            listNodes: [],
            loadingNodes: [],
            selectedArray: [],
            shimNode: null,
            activeNode: 0,
            textSize: 36,
            offset: offset,
            textColor: 'normal',
            layoutType: 'list',
            detailsVisibility: 'shown',
            sample: 'font',
            page: 1,
            pagesize: 20,
            pageHeight: 0,
            pageSizeMultiplier: 1.5,
            pageSizeMultiplierGrid: 1, //capping this at 1 so the grid pages will not have rows with orphans
            lastPageHeight: 0,
            maxPages: 1,
            sortTab: '',
            resizeTimeout: null,
            scrollTimeout: null,
            scrollThrottle: 100,
            lastScrollPos: null,
            renderedPages: {1: true},
            //placedPages: {1: {top: null, height: null, bottom: null, isFixed: false}},
            pageWatchdog: null,
            pageWatchdogInterval: 1000,
            scrollLock: false,
            initFlag: false,
            initCallback: initCallback,
            shiftFlag: false,
            lastSelected: null
        });

        //initState
        if (!_.isUndefined(this.initState.view.size) && this.initState.view.size !== '') {
            this.textSize = this.initState.view.size;
        }
        if (!_.isUndefined(this.initState.view.color) && this.initState.view.color !== '') {
            this.textColor = this.initState.view.color;
        }
        if (!_.isUndefined(this.initState.view.layout) && this.initState.view.layout !== '') {
            this.layoutType = this.initState.view.layout;
        }
        if (!_.isUndefined(this.initState.view.details) && this.initState.view.details !== '') {
            this.detailsVisibility = this.initState.view.details;
        }
        if (!_.isUndefined(this.initState.model.sample) && this.initState.model.sample !== '') {
            this.sample = this.initState.model.sample;
        } else {
            this.sample = "";
        }
        //if (!_.isUndefined(this.initState.model.languages) && this.initState.model.languages !== '') {
        //	this.filter_languages = this.initState.model.languages;
        //}

        //this.maxPages = Math.ceil(this.fonts.family_count / 20);

        utility.reqestAnimationFramePolyfill();
        this.render();
    };


    BrowseList.prototype.render = function () {
        // var traceLabel = "(browse-list.js::render)";
        // var t1 = performance.now();
        var self = this;

        //var context_fontfamilies = _.extend({}, self.fonts.fontfamilies);
        var context_fontfamilies = self.fonts.fontfamilies;
        self.page = 1;
        var emptyClass = '';
        if (self.fonts.fontfamilies.length == 0) {
            emptyClass = 'empty';
        }

        var context = {
            fontfamilies: context_fontfamilies,
            sort: self.fonts.sort,
            sample: self.sample,
            empty: emptyClass,
            config: this.config
        };

        var html = template.render(context);

        $(this.domNode).html(html);

        //init 3 font lists
        self.listNodes[0] = $(self.domNode).find('.font-list-a')[0];
        $(self.listNodes[0]).attr('id', _.uniqueId('fontlist_'));

        self.listNodes[1] = $(self.domNode).find('.font-list-b')[0];
        $(self.listNodes[1]).attr('id', _.uniqueId('fontlist_'));

        self.listNodes[2] = $(self.domNode).find('.font-list-c')[0];
        $(self.listNodes[2]).attr('id', _.uniqueId('fontlist_'));

        //init 3 loading lists
        self.loadingNodes[0] = $(self.domNode).find('.font-list-loading-a')[0];
        $(self.loadingNodes[0]).attr('id', _.uniqueId('fontlist_loading_'));

        self.loadingNodes[1] = $(self.domNode).find('.font-list-loading-b')[0];
        $(self.loadingNodes[1]).attr('id', _.uniqueId('fontlist_loading_'));

        self.loadingNodes[2] = $(self.domNode).find('.font-list-loading-c')[0];
        $(self.loadingNodes[2]).attr('id', _.uniqueId('fontlist_loading_'));

        self.shimNode = $(self.domNode).find('.font-list-shim')[0];
        $(self.shimNode).attr('id', _.uniqueId('fontlist_'));

        //display fonts
        //utility.trace(context, traceLabel, "context");

        self.displayFonts(context_fontfamilies, self.listNodes[0], true);
        // utility.trace('******', traceLabel, "END DISPLAYFONTS");
        self.initShim();
        self._postRender();
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.initShim = function() {
//        var traceLabel = "(browse-list.js:::initShim)";
//		var t1 = performance.now();
        var self = this;
        // utility.trace(self, traceLabel, "self");
        //console.log('init shim');

        //here we'll figure out number of list items to request per page
        //based on viewport size and the size of a rendered test list item
        var $shimNode = $(self.shimNode);
        $shimNode.width($(window).width() - 40);
        if ($shimNode.children().length == 0) {
            var context = {
                fontfamily: {url_name: '', name: 'Test', is_new_family: false, new_face_count: 0, changed_version_count: 0, is_legacy: false, is_deprecated: false, face_count: 0},
                fontface:  {postscript_name: 'test', style: 'Regular', full_name: 'Test', first_face_display: true},
                fontversion: {sample_string: 'Abcdefghijkl',  subset_location: '', file_type: '', woff_size: 0},
                rowclass: '',
                sort_tab: '',
                sort_tab_flag: false,
                tags_length: 0,
                surveys_length: 0,
                is_survey: self.config === 'survey',
                config: this.config,
                sampletouse: 'Abcdefghijkl'
            }

            //utility.trace(context, traceLabel, "context - listitem");
            var itemHtml = listItemTemplate.render(context);
            $shimNode.append(itemHtml);
        }
        // utility.trace(self.shimNode.childNodes, traceLabel, "self.shimNode.childNodes");
        // utility.benchMark(traceLabel, t1, performance.now());
    };

     BrowseList.prototype.getListHeight = function($listNode) {
       var self = this;

       var faceCount = $listNode.children().length;
       var $shimNode = $(self.shimNode);
       var listItemDimensions = self.getListItemDimensions();
       var itemsHorz = Math.floor($shimNode.width() / listItemDimensions.width);
       var listHeight = Math.ceil(listItemDimensions.height * faceCount / itemsHorz);
       //console.log('**** getListHeight', listItemDimensions, $listNode, faceCount, listHeight);
       return listHeight;
     }
    

    BrowseList.prototype.recalculatePage = function() {
        // var traceLabel = "(browse-list.js::recalculatePage)";
		// var t1 = performance.now();
        var self = this;
        // utility.trace(self.initFlag, traceLabel, "self.initFlag");

        //only recalculate once on page load
        if (self.initFlag) {
            self.initFlag = false;
            //console.log('recalculate page')

            var countToUse = self.fonts.family_count;
            if (self.config == 'survey') {
                countToUse = self.fonts.face_count;  // SET FOR FONTSURVEY
            }
            // utility.trace(countToUse, traceLabel, "countToUse");

            var $shimNode = $(self.shimNode);
            var listItemDimensions = self.getListItemDimensions();
            var itemsHorz = Math.floor($shimNode.width() / listItemDimensions.width);

            // utility.trace(itemsHorz, traceLabel, "itemsHorz");
            // utility.trace(listItemDimensions, traceLabel, "listItemDimensions");

            var itemsVert = Math.ceil(($(window).height() - self.offset) / listItemDimensions.height); // Number of list items that can be displayed
            // utility.trace(itemsVert, traceLabel, "itemsVert");
            var calculatedPageSize;
            if (self.layoutType == 'grid') {
                calculatedPageSize = Math.ceil(itemsHorz * itemsVert * self.pageSizeMultiplierGrid);
            } else {
                calculatedPageSize = Math.ceil(itemsHorz * itemsVert * self.pageSizeMultiplier);
            }
            // utility.trace(calculatedPageSize, traceLabel, "calculatedPageSize");
            // utility.trace(self.pagesize, traceLabel, "self.pagesize");
            var itemsToSkip = 0;
            // var itemsPerPage;

            if (calculatedPageSize > self.pagesize) {
                //fill in missing items to make up 1 page
                //console.log(calculatedPageSize, self.fonts.family_count)
                if (calculatedPageSize < countToUse) {
                    itemsToSkip = self.pagesize;
                    self.pagesize = calculatedPageSize;
                    self.pageHeight = self.pagesize / itemsHorz * listItemDimensions.height;
                    // utility.trace(self.pagesize, traceLabel, "UPDATED PAGESIZE");
                    
                    // if (self.config == 'survey') {
//                       // this will be the average number of faces per family
//                       itemsPerPage = Math.ceil(self.fonts.face_count / Math.ceil(self.fonts.family_count / self.pagesize));
//                     } else {
//                       itemsPerPage = self.pagesize;
//                     }
//
//                     self.pageHeight = itemsPerPage / itemsHorz * listItemDimensions.height;
//                     console.log('**** recalculatePage', self.pagesize, listItemDimensions.height, itemsPerPage, self.pageHeight)
                    
                    // utility.trace(self.pageHeight, traceLabel, "self.pageHeight PATH 1");
                    // utility.trace(self.page + ' : ' + calculatedPageSize + ' : ' + itemsToSkip, traceLabel, "get-page trigger parameters");
                    self.emit('get-page', self.page, calculatedPageSize, itemsToSkip, null);
                } else {
                    self.pageHeight = self.pagesize / itemsHorz * listItemDimensions.height;
                    // if (self.config == 'survey') {
//                       // this will be the average number of faces per family
//                       itemsPerPage = Math.ceil(self.fonts.face_count / Math.ceil(self.fonts.family_count / self.pagesize));
//                       console.log('**** recalculatePage', self.pagesize, listItemDimensions.height, itemsPerPage)
//                     } else {
//                       itemsPerPage = self.pagesize;
//                     }
//                     self.pageHeight = itemsPerPage / itemsHorz * listItemDimensions.height;
                    // utility.trace(self.pageHeight, traceLabel, "self.pageHeight PATH 2");
                }
            } else {
                //cut page down to less than 20?
                self.pageHeight = self.pagesize / itemsHorz * listItemDimensions.height;
                // if (self.config == 'survey') {
//                   // this will be the average number of faces per family
//                   itemsPerPage = Math.ceil(self.fonts.face_count / Math.ceil(self.fonts.family_count / self.pagesize));
//                 } else {
//                   itemsPerPage = self.pagesize;
//                 }
//
//                 self.pageHeight = itemsPerPage / itemsHorz * listItemDimensions.height;
//                 console.log('**** recalculatePage', self.pagesize, listItemDimensions.height, itemsPerPage, self.pageHeight)
//
                // utility.trace(self.pageHeight, traceLabel, "self.pageHeight PATH 3");
            }

            //console.log('*** HERE', self.pageHeight, listItemDimensions.height)
            //set the max pages and total page height
            self.maxPages = Math.ceil(countToUse / self.pagesize);
            self.lastPageHeight = Math.ceil((countToUse - ((self.maxPages - 1) * self.pagesize)) / itemsHorz) * listItemDimensions.height;
            // utility.trace(self.maxPages, traceLabel, "self.maxPages");
            // utility.trace(self.lastPageHeight, traceLabel, "self.lastPageHeight");
            var containerHeight = countToUse / itemsHorz * listItemDimensions.height;
            // utility.trace(containerHeight, traceLabel, "containerHeight");
            //console.log(self.lastPageHeight, self.maxPages);
            //console.log('page height', self.pagesize, itemsHorz, listItemDimensions.height, self.pageHeight);

            $('.browse-list-cont', self.domNode).height(containerHeight);
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.initPageWatchdog = function() {
        // var traceLabel = "(browse-list.js::initPageWatchdog)";
		// var t1 = performance.now();
        var self = this;

        if (!_.isNull(self.pageWatchdog)) {
            clearInterval(self.pageWatchdog);
        }

        self.pageWatchdog = setInterval(function(){
            // utility.trace(this.caller, traceLabel, "CALL TO WATCHDOG SETINTERVAL");
            if (!self.scrollLock) {
                // utility.trace(self.scrollLock, traceLabel, "self.scrollLock");
                //this function figures out which pages should be shown on the window
                //and tests if they are rendered

                var pos = window.pageYOffset;
                // utility.trace(pos, traceLabel, "pos");
                // utility.trace("Calling getPagesFromPosition", traceLabel, "getPagesFrom");
                var pages = self.getPagesFromPosition(pos);
                //console.log('*** pageWatchdog', pages)
                // utility.trace(pages, traceLabel, "pages");

                for (var i=0; i<pages.length; i++) {
                    if (_.isUndefined(self.renderedPages[pages[i]])) {
                        //console.log('*** page watchdog request', pages[i])
                        // utility.trace("self.requestPage", traceLabel, "CALLING self.requestPage");
                        //console.log('*** request page A');
                        self.requestPage(pages[i]);
                    } else {
                        // utility.trace(i, traceLabel, "page correctly loaded.");
                    }
                }
            }
        }, self.pageWatchdogInterval);
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.getScrollDirection = function(pos) {
        // var traceLabel = "(browse-list.js::getScrollDirection)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::getScrollDirection");
        var dir = '';
        if (this.lastScrollPos > pos) {
            dir = 'up';
        } else {
            dir = 'down';
        }
        return dir;
    };

    // BrowseList.prototype.getPageFromPositionSurvey = function(pos) {
    //       // var traceLabel = "(browse-list.js::getPageFromPosition)";
    //       // var t1 = performance.now()
    //       // utility.trace("", traceLabel, "browse-list.js::getPageFromPosition");
    //       var page = null;
    //       if (pos < 0) {
    //           pos = 0;
    //       }
    //       page = Math.floor(((pos) / this.pageHeight) + 1);
    //       if (_.isNull(page) || _.isNaN(page) || !_.isFinite(page) || _.isUndefined(page)) {
    //           page = 1;
    //       }
    //       return page;
    //       // utility.benchMark(traceLabel, t1, performance.now());
    //       //return page > 0 ? page : 1;
    //   };


    BrowseList.prototype.getPageFromPosition = function(pos) {
        // var traceLabel = "(browse-list.js::getPageFromPosition)";
        // var t1 = performance.now()
        // utility.trace("", traceLabel, "browse-list.js::getPageFromPosition");
        var self = this;
        var page = null;
        if (pos < 0) {
            pos = 0;
        }
        // if (self.config == 'survey') {
//           _.mapObject(self.placedPages, function (placedPage, pageId) {
//             if ((pos + self.offset) >= placedPage['top'] && (pos + self.offset) <= placedPage['bottom']) {
//               page = parseInt(pageId, 10);
//             }
//           });
//         } else {
          page = Math.floor(((pos) / this.pageHeight) + 1);
        //}
        if (_.isNull(page) || _.isNaN(page) || !_.isFinite(page) || _.isUndefined(page)) {
            page = 1;
        }
        
        //console.log('*** getPageFromPosition', page);
        // console.log('*** getPageFromPosition', pos + self.offset, self.offset, self.placedPages, page);
        
        return page;
        // utility.benchMark(traceLabel, t1, performance.now());
        //return page > 0 ? page : 1;
    };

    BrowseList.prototype.getPagesFromPosition = function(pos) {
        // var traceLabel = "(browse-list.js::getPagesFromPosition)";
		// var t1 = performance.now();
        // utility.trace(pfpCounter++, traceLabel, "browse-list.js::getPagesFromPosition");
        var page = 1;
        if (pos > 0) {
            page = Math.floor(((pos) / this.pageHeight) + 1);
        }

        if (page == 0) {
            page = 1;
        }
        var pages = [page];
        var nextPage = page + 1;
        var nextPos = this.getPositionFromPage(nextPage);
        // utility.trace(nextPage, traceLabel, "nextPage");
        // utility.trace(nextPos, traceLabel, "nextPos");
        // utility.trace(window.innerHeight, traceLabel, "window.innerHeight");

        if (nextPos > pos && nextPos < (pos + window.innerHeight)) {
            //if (nextPage <= self.maxPages) {
            pages.push(nextPage);
            //}
        }

        return pages;
        // utility.benchMark(traceLabel, t1, performance.now());
        //return page > 0 ? page : 1;
    };

    BrowseList.prototype.getPositionFromPage = function(page) {
        // var traceLabel = "(browse-list.js::getPositionFromPage)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::getPositionFromPage");
        // utility.trace(this.pageHeight, traceLabel, "this.pageHeight");
        // utility.trace(page, traceLabel, "page");
        // utility.trace(this.offset, traceLabel, "this.offset");

        //console.log('*** getPositionFromPage', this.pageHeight, page);
        return ((this.pageHeight * (page - 1)) + this.offset );
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.handlePageScroll = function() {

        // var traceLabel = "(browse-list.js::handlePageScroll)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::handlePageScroll");
        var self = this;
        var nextPage = null;
        var prevPage = null;
        self.scrollLock = true;

        //var pos = $(window).scrollTop();
        var pos = window.pageYOffset;
        // utility.trace(pos, traceLabel, "pos");

        // console.log('*** handlePageScroll', self.renderedPages, self.page)

        //console.log(pos, window.pageYOffset)

        if (pos > -1) {
            var dir = self.getScrollDirection(pos);
            var page = self.getPageFromPosition(pos);
            // utility.trace(dir, traceLabel, "dir");
            // utility.trace(page, traceLabel, "page");
            // utility.trace(self.maxPages, traceLabel, "self.maxPages");

            //console.log('*** handlePageScroll', self, self.renderedPages, self.page, page)


            if (dir == 'down') {
              
                //console.log('*** dirDown', page)
                nextPage = page + 1;

                //var bottomOfWindow = pos + window.innerHeight - self.offset;
                //var tenListItemsHeight = self.shimNode.childNodes[1].offsetHeight * 10;
                //var listBottom = self.placedPages[self.page]['bottom'];
                //var withinRange = false;
                //if (bottomOfWindow >= listBottom - tenListItemsHeight) {
                //  withinRange = true;
                //}
                if (nextPage <= self.maxPages && _.isUndefined(self.renderedPages[nextPage])) {
                    //if (self.config == 'survey') {
                    //  if (withinRange) {
                    //    self.requestPage(nextPage);
                    //  }
                    //} else {
                      self.requestPage(nextPage);
                      //}
                }
            } else if (dir == 'up') {

                //check to see if current position is higher than current page bottom
                //render prev page if we're not on the first page
                prevPage = page - 1;
                if (prevPage >= 1 && _.isUndefined(self.renderedPages[prevPage])) {
                    //console.log('*** request page C');
                    self.requestPage(prevPage);
                }
            }

            //no man's land case
            //if (self.config != 'survey') {
              if (_.isUndefined(self.renderedPages[page])) {
                  //console.log('*** request page D');
                  self.requestPage(page);
              }
            //}

            //console.log('here', pages)
            //for (var i=0; i<pages.length; i++) {
            //	if (_.isUndefined(self.renderedPages[pages[i]])) {
            //		self.requestPage(pages[i]);
            //	}
            //}

            //console.log('handle page scroll', pos, page, dir);

            self.lastScrollPos = pos;
        }
        self.scrollLock = false;
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.scrollHandler = function(browseList) {

        // var traceLabel = "(browse-list.js::scrollHandler)";
		// var t1 = performance.now();
        var self = browseList;
        if (self.scrollTimeout == null) {
            self.scrollTimeout = setTimeout(function() {
                self.handlePageScroll();
                self.scrollTimeout = null;
            }, self.scrollThrottle);
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.resizeHandler = function(browseList) {
        // var traceLabel = "(browse-list.js::resizeHandler)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::resizeHandler");
        var self = browseList;

        if (self.resizeTimeout) {
            clearTimeout(self.resizeTimeout);
        }
        self.resizeTimeout = setTimeout(function() {
            self.recalculatePage();
        }, 200);
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.abortPage = function(page) {
        // var traceLabel = "(browse-list.js::abortPage)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::abortPage");
        var self = this;

        if (self.renderedPages.hasOwnProperty(page)) {
            delete self.renderedPages[page];
            self.clearLoadingPage(page);
        }
        //console.log('** abort page', page, self.renderedPages);
    };

    BrowseList.prototype.requestPage = function(page) {
        // var traceLabel = "(browse-list.js:::requestPage)";
		// var t1 = performance.now();
        // utility.trace(page, traceLabel, "page");
        var self = this;
        self.renderedPages[page] = true;
        self.emit('get-page', page, self.pagesize, 0, null);
        // utility.benchMark(traceLabel, t1, performance.now());
        //console.log('request page', page, self.renderedPages);
        //console.log('request page', page);
    };

    BrowseList.prototype._postRender = function () {
        // var traceLabel = "(browse-list.js:::_postRender)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::_postRender");
        var self = this;

        //console.log('post render');
        self.setTextSize(self.textSize, false);
        self.setTextColor(self.textColor);
        self.setLayout(self.layoutType, false);
        self.setDetailsVisibility(self.detailsVisibility);

        $(self.listNodes[0]).css({'top': (0 + self.offset)});

        //this should go after setLayout is called
        self.initList();

        //delegated click handler
        $( ".browse-list-list", self.domNode ).on( "click", ".info-cell", function(e) {
            e.stopPropagation();
            $(location).attr('href',  $( this ).closest('li').data('url'));
        });

        if (self.config == 'survey') {
            //  SET FOR FONTSURVEY
            $( ".browse-list-list", self.domNode ).on( "change", ".checkbox-cell input[type=checkbox]", function(e) {
                e.stopPropagation();
                var li = $(this).closest('li');
                self.toggleSelected(li, false, true);
            });
            $( ".browse-list-list", self.domNode ).on( "mouseover", ".checkbox-cell input[type=checkbox]", function(e) {
                $(this).addClass('hover');
            });
            $( ".browse-list-list", self.domNode ).on( "mouseout", ".checkbox-cell input[type=checkbox]", function(e) {
                $(this).removeClass('hover');
            });
            $( ".browse-list-list", self.domNode ).on( "click", ".checkbox-cell", function(e) {
                //e.stopPropagation();
                //e.preventDefault();
                var li = $(this).closest('li');
                var cb = li.find(":checkbox");
                if (!cb.hasClass("hover")) {
                    self.toggleSelected(li, true, true);
                } else {
                    //console.log('hovered')
                }
            });
        }

        $('.btn', self.domNode).button();

        $(window).on('resize', function() {
        	window.requestAnimationFrame(function() {self.resizeHandler(self);});
        });

        $(window).on('scroll', function() {
           window.requestAnimationFrame(function() {self.scrollHandler(self);});
        });

        if (self.config == 'survey') {
            // SET FOR FONTSURVEY
            document.onkeydown = function(e) {
                switch (e.keyCode) {
                    case 16:
                        self.shiftFlag = true;
                        break;
                }
            };
            document.onkeyup = function(e) {
                switch (e.keyCode) {
                    case 16:
                        self.shiftFlag = false;
                        break;
                }
            };
        }
        // utility.trace("Calling initPageWatchdog", traceLabel, "_postRender");
        if (!self.config == 'survey') {
          self.initPageWatchdog();
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    /*****************************************************************************/
    /*** FONTSURVEY BLOCK ********************************************************/
    /*****************************************************************************/

    BrowseList.prototype.toggleSelected = function(li, forceFlag, handleShiftFlag) {
        /**
         * Fontface select checkbox. Used to add/remove tags from fontfaces.
         */
//        var traceLabel = "(browse-list.js:::toggleSelected)";

//		var t1 = performance.now();

        var self = this;
        var cb = li.find(":checkbox");
        if (forceFlag) {
            if (cb.prop("checked")) {
                cb.prop("checked", false);
            } else {
                cb.prop("checked", true);
            }
        }

        if (cb.is(":checked")) {
            if (handleShiftFlag) {
                self.handleShift(li);
            }
            self.lastSelected = li.data('row');
            li.addClass('selected');
            if (li.data('row') != "" && cb.data("id") != "") {
                self.selectedArray.push({"row": li.data('row'), "id": cb.data("id")});
            }
        } else {
            self.lastSelected = null;
            li.removeClass('selected');

            self.selectedArray = _.without(self.selectedArray, _.findWhere(self.selectedArray, {"id": cb.data("id")}));
        }
        // utility.trace(self.selectedArray, traceLabel, "self.selectedArray");
        self.emit('toggle-selected', self.selectedArray.length);
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.addToSelected = function(cb, self) {
        /**
         * @PARAM cb - A checkbox HTML element of classname: 'faceselectcheckbox'
         * @PARAM self - A BrowseList object
         * 
         * Determines if an entry for the current checkbox exists in the selectedArray, and if not, triggers the
         * toggle action.
         */
        if (self.selectedArray.indexOf(_.findWhere(self.selectedArray, { "id": cb.dataset.id })) == -1) {
            thisLi = $("li[data-row='" + cb.dataset.row + "']", self.domNode);
            self.toggleSelected(thisLi, true, false);
        }
    }

    BrowseList.prototype.selectAll = function(selectAllFlag) {
        /**
         * Select/deselect all checkboxes currently rendered.
         */
//        var traceLabel = "(browse-list.js:::selectAll)";
//		var t1 = performance.now();
        
        var self = this;
        var thisLi = null;
        var cb = null;

        if (selectAllFlag) {
            // Get all checkboxes
            var cbArray = document.getElementsByClassName("faceselectcheckbox");
            for (var i = 0; i < cbArray.length; i++) {
                self.addToSelected(cbArray[i], self);
            }
        } else {
            //de-select all
            for (var i=0; i < self.selectedArray.length; i++) {
                thisLi = $("li[data-row='" + self.selectedArray[i]["row"] + "']", self.domNode);
                if (thisLi.length != 0) {
                    thisLi.removeClass('selected');
                    cb = thisLi.find(":checkbox");
                    cb.prop("checked", false);
                }
            }
            self.selectedArray = [];
            self.lastSelected = null;
            self.emit('toggle-selected', self.selectedArray.length);
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };


    BrowseList.prototype.handleShift = function(li) {
        // var traceLabel = "(browse-list.js::handleShift)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::handleShift");
        var self = this;
        var thisRow = li.data('row');

        var thisLi = null;
        var fromRow = null;
        var toRow = null;

        if (self.shiftFlag && self.lastSelected != null && self.lastSelected != thisRow) {
            if (thisRow > self.lastSelected) {
                //console.log('shift below');
                fromRow = self.lastSelected + 1;
                toRow = thisRow;
            } else {
                //console.log('shift above');
                fromRow = thisRow + 1;
                toRow = self.lastSelected;
            }

            for (var i = fromRow; i < toRow; i++) {
                if (self.selectedArray.indexOf(i) == -1) {
                    thisLi = $("li[data-row='"+i+"']", self.domNode);
                    if (thisLi.length != 0) {
                        self.toggleSelected(thisLi, true, false);
                    }
                }
            }
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.updateTags = function(fontfaces) {
      var self = this;
      if (_.isArray(fontfaces) && fontfaces.length > 0) {
        for (var i=0; i<fontfaces.length; i++) {
          var fontface = fontfaces[i];
          var $thisItem = $('.font-list', self.domNode).find('[data-id="'+fontface.id+'"]');
          var $thisTagList = $thisItem.find('.whatsnew');
          var tags = fontface.tags;
          if (_.isArray(tags) && tags.length > 0) {
            for (var j=0; j<tags.length; j++) {
              var tag = tags[j];
              if ($thisItem.find('[data-tagurl="'+tag.url_name+'"]').length == 0) {
                $thisTagList.append('<li class="tagx" data-tagurl="'+tag.url_name+'"><a href="#" class="label label-default">'+tag.name+'</a></li>');
              }
            }
          }
        }
      }
    }

    BrowseList.prototype.updateSurveys = function(fontfaces) {
      var self = this;
      if (_.isArray(fontfaces) && fontfaces.length > 0) {
        for (var i=0; i<fontfaces.length; i++) {
          var fontface = fontfaces[i];
          var $thisItem = $('.font-list', self.domNode).find('[data-id="'+fontface.id+'"]');
          var $thisTagList = $thisItem.find('.whatsnew');
          var surveys = fontface.surveys;
          if (_.isArray(surveys) && surveys.length > 0) {
            for (var j=0; j<surveys.length; j++) {
              var survey = surveys[j];
              if ($thisItem.find('[data-surveyurl="'+survey.url_name+'"]').length == 0) {
                $thisTagList.append('<li class="surveyx" data-surveyurl="'+survey.url_name+'"><a href="#" class="label label-info">'+survey.url_name+'</a></li>');
              }
            }
          }
        }
      }
    }


    BrowseList.prototype.addTagToSelected = function(tagObj) {
        /*
        * Called from browse-component.js fontface2tagsurvey event
        */
//        var traceLabel = "(browse-list.js:::addTagToSelected)";
//		var t1 = performance.now();

        var self = this;
        var tagUrl = tagObj.id.substring(4);
        var tagName = tagObj.text;
        // utility.trace(tagObj, traceLabel, "tagObj");

        $('.font-list > li.selected', self.domNode).each(function (i, thisItem) {
            var $thisTagList = $(thisItem).find('.whatsnew');
            //only add a new item if it's not already there
            if ($(thisItem).find('[data-tagurl="'+tagUrl+'"]').length == 0) {
                $thisTagList.append('<li class="tagx" data-tagurl="'+tagUrl+'"><a href="#" class="label label-default">'+tagName+'</a></li>');
                // utility.trace(thisItem, traceLabel, "thisItem");
            }
        });
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.removeTagFromSelected = function(tagObj) {
        /*
        * Called from browse-component.js fontface2tagsurvey event
        */
//        var traceLabel = "(browse-list.js:::removeTagFromSelected)";
//		var t1 = performance.now();

        var self = this;
        var tagUrl = tagObj.id.substring(4);

        $('.font-list > li.selected', self.domNode).each(function (i, thisItem) {

            var $thisTagList = $(thisItem).find('.whatsnew');
            // utility.trace($thisTagList, traceLabel, "thisTagList");
            $thisTagList.children('li').each(function (j, thisTag) {
                // utility.trace(thisTag, traceLabel, "thisTag");
                if ($(thisTag).data('tagurl') == tagUrl) {
                    $(thisTag).remove();
                }
            });
        });
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.addSurveyToSelected = function(surveyObj) {
        /*
        * Called from browse-component.js fontface2tagsurvey event
        */
//        var traceLabel = "(browse-list.js::addSurveyToSelected)";
//		var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::addSurveyToSelected");
        var self = this;

        var surveyUrl = surveyObj.id.substring(4);
        var surveyName = surveyObj.text;

        $('.font-list > li.selected', self.domNode).each(function (i, thisItem) {
            var $thisTagList = $(thisItem).find('.whatsnew');
            //only add a new item if it's not already there
            if ($(thisItem).find('[data-surveyurl="'+surveyUrl+'"]').length == 0) {
                $thisTagList.append('<li class="surveyx" data-surveys="'+surveyUrl+'"><a href="#" class="label label-info">'+surveyUrl+'</a></li>');
            }
        });
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.removeSurveyFromSelected = function(surveyObj) {
        /*
        * Called from browse-component.js fontface2tagsurvey event
        */
//        var traceLabel = "(browse-list.js::removeSurveyFromSelected)";
//		var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::removeSurveyFromSelected");
        var self = this;
        var surveyUrl = surveyObj.id.substring(4);

        $('.font-list > li.selected', self.domNode).each(function (i, thisItem) {
            var $thisTagList = $(thisItem).find('.whatsnew');
            $thisTagList.children('li').each(function (j, thisSurvey) {
                if ($(thisSurvey).data('surveyurl') == surveyUrl) {
                    $(thisSurvey).remove();
                }
            });
        });
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    /*****************************************************************************/
    /*** END FONT  BLOCK ****************************************************/
    /*****************************************************************************/

    BrowseList.prototype.initList = function() {
        // var traceLabel = "(browse-list.js::initList)";
		// var t1 = performance.now();
        var self = this;

        //console.log('init list');

        self.initFlag = true;
        self.lastScrollPos = $(window).scrollTop();
        // utility.trace(self.lastScrollPos, traceLabel, "self.lastScrollPos");

        //console.log('init list');
        self.recalculatePage();

        //self.initSteady();

        if (_.isFunction(self.initCallback)) {
            // utility.trace(self.initCallback, traceLabel, "Executing Callback");
            self.initCallback();
            self.initCallback = null;
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.getListItemDimensions = function() {
        // var traceLabel = "(browse-list.js::getListDimensions)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::getListDimensions");
        var self = this;
        var childToUse = 1;

        var $shimNode = $(self.shimNode);
        // utility.trace(self.shimNode.childNodes, traceLabel, "self.shimNode.childNodes");
        $shimNode.width($(window).width() - 40);

        //console.log('*** getListItemDimensions', $shimNode.width(), $shimNode.height(), self.shimNode.childNodes)

        return {
            width: self.shimNode.childNodes.length > 0 ? self.shimNode.childNodes[childToUse].offsetWidth : 0,
            height: self.shimNode.childNodes.length > 0 ? self.shimNode.childNodes[childToUse].offsetHeight : 0
        };
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.getSampleString = function(sample, fontversion) {
        var defaultString = fontversion.sample_string;
        // Base case. No sample parameter defined.
        if (sample == null || sample == '') {
            return defaultString;
        }

        // Use the first pangram, if one is available. Otherwise return default.
        if (sample == 'pangram') {
            if (fontversion.language_pangrams != null && fontversion.language_pangrams.length > 0) {
                return fontversion.language_pangrams[0];
            } else {
                return defaultString;
            }
        }

        if (sample == 'alpha') {
            if (fontversion.language_alphabet != null && fontversion.language_alphabet != "") {
                return fontversion.language_alphabet;
            } else {
                return defaultString;
            }
        }

        if (sample == 'font') {
            return defaultString;
        }

        if (sample == 'script') {
            return defaultString;
        }

        if (sample == 'sample') {
            return defaultString;
        }

        return sample;
    }
    
    BrowseList.prototype.displaySurveyFonts = function(fontfamilies, $listNode, self) {
//        var traceLabel = "(browse-list.js:::displaySurveyFonts)";
        // var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::surveyFonts");

        var k = 0;
        var sort_tab_flag = false;
        // utility.trace(self, traceLabel, "self");

        // $.each(fontfamilies, function(i, fontfamily) {
        // utility.trace(fontfamilies.length, traceLabel, "i = 0 to length");
        for (var i = 0; i < fontfamilies.length; i++) {
            fontfamily = fontfamilies[i];
            //var fontface = fontfamily.fontfaces[0];

            self.lastFontfamily = fontfamily.url_name;

            // $.each(fontfamily.fontfaces, function(j, fontface) {
            // utility.trace(fontfamily.fontfaces.length, traceLabel, "j = 0 to length");
            for (var j = 0; j < fontfamily.fontfaces.length; j++) {
                fontface = fontfamily.fontfaces[j];
                // utility.trace(i, traceLabel, "i");
                // utility.trace(j, traceLabel, "j");

                var fontversion = fontface.fontversions[0];
                var sort = self.fonts.sort;
                var firstFaceFlag = false;

                k += 1;
                if (sort == 'script' || sort == '') {
                    if (self.sortTab != fontversion.primary_script) {
                        self.sortTab = fontversion.primary_script;
                        sort_tab_flag = true;
                    } else {
                        sort_tab_flag = false;
                    }
                } else if (sort == 'alpha') {
                    if (self.sortTab != fontfamily.name.substring(0,1)) {
                        self.sortTab = fontfamily.name.substring(0,1);
                        sort_tab_flag = true;
                    } else {
                        sort_tab_flag = false;
                    }
                }
                if (j > 0) {
                    firstFaceFlag = false;
                }

                var selectedFlag = false;
                if (self.selectedArray.indexOf(_.findWhere(self.selectedArray, { "row": fontface.row })) != -1) {
                    selectedFlag = true;
                }

                var tags_length = 0;
                if (!_.isUndefined(fontface['tags'])) {
                    tags_length = fontface['tags'].length;
                }
                var surveys_length = 0;
                if (!_.isUndefined(fontface['surveys'])) {
                    surveys_length = fontface['surveys'].length;
                }

                var context = {
                    fontfamily: fontfamily,
                    fontface:  fontface,
                    fontversion: fontversion,
                    language: fontversion.language,
                    rowclass: (i % 2) ? '' : 'odd',
                    sort: sort,
                    sort_tab: self.sortTab,
                    sort_tab_flag: sort_tab_flag,
                    compare_from_string: self.fonts.compare_from_string,
                    compare_to_string: self.fonts.compare_to_string,
                    first_face_flag: firstFaceFlag,
                    index: k,
                    tags_length: tags_length,
                    surveys_length: surveys_length,
                    is_survey: self.config === 'survey',
                    selected: selectedFlag,
                    config: self.config,
                    sampletouse: self.getSampleString(self.sample, fontversion)
                };
                // utility.trace(context, traceLabel, "context");

                var itemHtml = listItemTemplate.render(context);
                // utility.trace(itemHtml, traceLabel, "itemHtml");
                // utility.trace($listNode, traceLabel, "$listNode");
                $listNode.append(itemHtml);
                var fontversion = fontface.fontversions[0];
                var subset_location = fontversion.subset_location;
                if (self.sample != undefined && self.sample != "") {
                    // If a custom sample string is being used, don't use the font subset as the subset may not contain all necessary characters.
                    subset_location = "";
                    self.ignoreSubset = true;
                }

                var is_apple_font = fontversion.is_apple_font;
                //console.log(is_apple_font)
                var fontSourceObj = {
                    "fontsource_type": fontface.source_display_type,
                    "fontsubsetspath": fontface.display_subset_path,
                    "fontwoffspath": fontface.display_woff_path,
                    "ignoresubset": self.ignoreSubset
                }
                // utility.trace(fontSourceObj, traceLabel, "fontSourceObj");
                utility.addFont(fontface.postscript_name, fontversion.file_location, subset_location, fontversion.file_fragment, is_apple_font, fontSourceObj);
            }
            self.ignoreSubset = false;
            // });
        }
        // utility.trace(k, traceLabel, "k upon completion");
        // });
        self.setTextSize(self.textSize, false);  // Set the font size in the CSS. Do not recalculate the page size.
        // utility.benchMark(traceLabel, t1, performance.now());
        /*
        $.each(fontfamilies, function(i, fontfamily) {
            $.each(fontfamily.fontfaces, function(j, fontface) {

                //var fontface = fontfamily.fontfaces[0];
                var fontversion = fontface.fontversions[0];
                var subset_location = fontversion.subset_location;
                var is_apple_font = fontversion.is_apple_font;
                //console.log(is_apple_font)

                utility.addFont(fontface.postscript_name, fontversion.file_location, subset_location, fontversion.file_fragment, is_apple_font);
            });
        });
        */
    };

    BrowseList.prototype.displayCatalogFonts = function(fontfamilies, $listNode, self) {
//        var traceLabel = "(browse-list.js:::displayCatalogFonts)";
//		var t1 = performance.now();
        // utility.trace(self, traceLabel, "self");
        var sort_tab_flag = false;

        //console.log('display fonts')

        $.each(fontfamilies, function(i, fontfamily) {

            var fontface = fontfamily.fontfaces[0];
            var fontversion = fontface.fontversions[0];
            var sort = self.fonts.sort;

            if (sort == 'script' || sort == '') {
                if (self.sortTab != fontversion.primary_script) {
                    self.sortTab = fontversion.primary_script;
                    sort_tab_flag = true;
                } else {
                    sort_tab_flag = false;
                }
            } else if (sort == 'alpha') {
                if (self.sortTab != fontfamily.name.substring(0,1)) {
                    self.sortTab = fontfamily.name.substring(0,1);
                    sort_tab_flag = true;
                } else {
                    sort_tab_flag = false;
                }
            }

            // utility.trace(fontversion, traceLabel, "fontversion");
            var context = {
                fontfamily: fontfamily,
                fontface:  fontface,
                fontversion: fontversion,
                language: fontversion.language,
                file_type: fontversion.file_type,
                woff_size: fontversion.woff_size,
                rowclass: (i % 2) ? '' : 'odd',
                sort: sort,
                sort_tab: self.sortTab,
                sort_tab_flag: sort_tab_flag,
                compare_from_string: self.fonts.compare_from_string,
                compare_to_string: self.fonts.compare_to_string,
                config: self.config,
                sampletouse: self.getSampleString(self.sample, fontversion)
            }
            // utility.trace(context, traceLabel, "context");
            var itemHtml = listItemTemplate.render(context);
            $listNode.append(itemHtml);
        });

        self.setTextSize(self.textSize, false);

        $.each(fontfamilies, function(i, fontfamily) {
            var fontface = fontfamily.fontfaces[0];
            var fontversion = fontface.fontversions[0];
            var subset_location = fontversion.subset_location;
            var is_apple_font = fontversion.is_apple_font;

            if (self.sample != undefined && self.sample != "") {
                // If a custom sample string is being used, don't use the font subset as the subset may not contain all necessary characters.
                subset_location = "";
                self.ignoreSubset = true;
            }
            //console.log(is_apple_font)
            var fontSourceObj = {
                "fontsource_type": fontface.source_display_type,
                "fontsubsetspath": fontface.display_subset_path,
                "fontwoffspath": fontface.display_woff_path,
                "ignoresubset": self.ignoreSubset
            }
            // utility.trace(fontSourceObj, traceLabel, "fontSourceObj");
            utility.addFont(fontface.postscript_name, fontversion.file_location, subset_location, fontversion.file_fragment, is_apple_font, fontSourceObj);
            
        });
        self.ignoreSubset = false;
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    // BrowseList.prototype.getListTop = function($listNode) {
//       var self = this;
//       var cssTop = self.getPositionFromPage(self.page);
//
//       if (!_.isUndefined(self.placedPages[self.page]) && self.placedPages[self.page]['isFixed'] === true) {
//         //console.log('*** place from cache', self.page, self.placedPages[self.page]['top'])
//         cssTop = self.placedPages[self.page]['top'];
//       } else {
//
//         var $prevListNode, $nextListNode, prevTop, prevBottom, listBottom;
//         // check collisions
//         $.each(self.listNodes, function(i, node) {
//             var thisPage = parseInt($(node).attr('data-page'), 10);
//             if (thisPage === self.page - 1) {
//               $prevListNode = $(node);
//             } else if (thisPage === self.page + 1) {
//               $nextListNode = $(node);
//             }
//         });
//
//         // make sure it doesn't fall on previous list
//         if (!_.isUndefined($prevListNode)) {
//
//           var prevPlacedPage = self.placedPages[self.page - 1];
//           if (!_.isUndefined(prevPlacedPage)) {
//             prevTop = prevPlacedPage['top'];
//             prevBottom = prevPlacedPage['bottom'];
//             //if (cssTop > prevTop && cssTop < prevBottom) {
//             cssTop = prevBottom+1;
//             //}
//           }
//
//         }
//         // make sure it doesn't fall on next list
//         if (!_.isUndefined($nextListNode)) {
//           nextTop = parseInt($nextListNode.css('top'), 10);
//           listBottom = $listNode.height() + cssTop;
//           if (listBottom > nextTop) {
//             cssTop = nextTop - $listNode.height() - 1;
//           }
//         }
//
//
//         //console.log('*** check collisions', self.page, $prevListNode, $nextListNode, cssTop, prevTop, prevBottom);
//       }
//
//       return cssTop;
//     }

    BrowseList.prototype.displayFonts = function(fontfamilies, listNode, initCall) {
        // var traceLabel = "(browse-list.js::displayFonts)";
		// var t1 = performance.now();
        initCall = true;

        //console.log('*** browselist displayfonts', fontfamilies)
        //var faceCount = fontfamilies.reduce((count, family) => count + family.face_count, 0);

        // utility.trace(fontfamilies, traceLabel, "fontfamilies");
        // utility.trace(listNode, traceLabel, "listNode");
        var self = this;
        var cssTop;
        var cssHeight;

        //var $listNode = $(self.listNodes[self.activeNode]);
        
        // utility.trace(cssTop, traceLabel, "cssTop");
        var $listNode = $(listNode);
        $listNode.attr("data-page", self.page);

        //var placedPage = {top: null, height: null, bottom: null, isFixed: false};
        // $listNode.css({'top': self.getPositionFromPage(self.page) });

        if (initCall) {
            if (this.config == 'catalog') {
                this.displayCatalogFonts(fontfamilies, $listNode, self)
            } else {
                this.displaySurveyFonts(fontfamilies, $listNode, self)
            }
        }

        // hack to reset page height to help prevent overlays
        //self.pageHeight = $listNode.height(); 
        //$('.browse-list-cont', self.domNode).height(self.pageHeight * self.maxPages);
        //console.log('*** here', self)
        // set height after adding fonts
        if (self.page == self.maxPages) {
            $listNode.css({'height': 'auto'});
        } else {
            // utility.trace(self.pageHeight, traceLabel, "self.pageHeight");
            //$listNode.height(self.pageHeight);
            //if (self.config == 'survey') {
            //  cssHeight = $listNode[0].offsetHeight;
            //} else {
            cssHeight = self.pageHeight;
              //}
            //$listNode.height(cssHeight);
            //placedPage['height'] = cssHeight;
        }

        // set top after adding fonts and setting height
        //if (self.config == 'survey') {
        //  cssTop = self.getListTop($listNode);
        //} else {
        cssTop = self.getPositionFromPage(self.page);
        //}
        //console.log('*** ', $listNode)
        $listNode.css({'top': cssTop });
        //placedPage['top'] = cssTop;
        //if (!_.isUndefined(cssHeight) && !_.isUndefined(cssTop)) {
        //  placedPage['bottom'] = cssTop + cssHeight;
        //}
        //if ((self.page == 1 && $(window).scrollTop() === 0) || 
        //  (!_.isUndefined(self.placedPages[self.page - 1]) && self.placedPages[self.page - 1]['isFixed'] === true))
        //{
        //  placedPage['isFixed'] = true;
        //}
        //if (_.isUndefined(self.placedPages[self.page]) || self.placedPages[self.page]['isFixed'] === false || self.page === 1) {
        //  self.placedPages[self.page] = placedPage;
        //}


        //console.log('***** displayFonts after', $(window).scrollTop(), self.config, cssHeight, self.pageHeight, self.placedPages)
        
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.getListNode = function(page) {
        // var traceLabel = "(browse-list.js::getListNode)";
        // var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::getListNode");
        var self = this;
        var returnNode = null;
        //var l = _.keys(self.renderedPages).length;

        //$.each(self.listNodes, function(i, node) {

        //	var thisPage = $(node).attr('data-page');
        //	console.log(i, thisPage, node);
        //});

        var furthestNode = 0;
        var furthestDistance = 0;
        $.each(self.listNodes, function(i, node) {

            var thisPage = $(node).attr('data-page');
            var thisDistance = 0;
            if (_.isUndefined(thisPage)) {
                self.activeNode = i;
                // utility.trace(self.activeNode, traceLabel, "self.activeNode");
                returnNode = self.listNodes[self.activeNode];
                return false; //break
            } else {
                if (thisPage == page) {
                    self.activeNode = i;
                    returnNode = self.listNodes[self.activeNode];
                    return false; //break
                } else if (thisPage > page) {
                    thisDistance = thisPage - page;
                } else if (page > thisPage) {
                    thisDistance = page - thisPage;
                }
                if (furthestDistance == 0 || (thisDistance > furthestDistance)) {
                    furthestDistance = thisDistance;
                    furthestNode = i;
                }
            }
        });
        // utility.trace(returnNode, traceLabel, "returnNode");

        if (returnNode == null) {
            self.activeNode = furthestNode;
            self.emptyNode(self.listNodes[self.activeNode]);
            returnNode = self.listNodes[self.activeNode];
        }
        // utility.benchMark(traceLabel, t1, performance.now());
        return returnNode;
    };

    BrowseList.prototype.emptyNode = function(listNode) {
        // var traceLabel = "(browse-list.js::emptyNode)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::emptyNode");
        //console.log('empty node', listNode)

        var $listNode = $(listNode);
        var thisPage = $listNode.attr('data-page');
        $listNode.empty();
        // utility.trace(thisPage, traceLabel, "thisPage");

        //console.log('empty node', listNode, thisPage);
        if (this.renderedPages.hasOwnProperty(thisPage)) {
            delete this.renderedPages[thisPage];
            // utility.trace("DELETING RENDERED PAGE", traceLabel, "thisPage");
            //console.log('empty node', thisPage, this.renderedPages);
        }
        $listNode.attr('data-page', '');
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.addPage = function(page, pagesize, data, done) {
        // var traceLabel = "(browse-list.js::addPage)";
		    // var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::addPage");
        var self = this;

        self.page = page;
        var listNode = self.getListNode(page);
        // console.log('*** add page', page, listNode, self.getListHeight($(listNode)));
        // utility.trace(listNode, traceLabel, "listNode");
        // utility.trace(data.fontfamilies, traceLabel, "data.fontfamilies");
        self.displayFonts(data.fontfamilies, listNode, false);

        if (_.isFunction(done)) {
            done();
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.clearLoadingPage = function(page) {
        // var traceLabel = "(browse-list.js::clearLoadingPage)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::clearLoadingPage");
        var self = this;
        // utility.trace(page, traceLabel, "page");
        //$loadingNode.attr('data-page', '').removeClass('active');

        $.each(self.loadingNodes, function(i, node) {
            var thisPage = $(node).attr('data-page');
            // utility.trace(thisPage, traceLabel, "thisPage");
            if (thisPage == page) {
                $(node).attr('data-page', '').removeClass('active');
                // utility.trace("removeClass", traceLabel, "Removing");
                return false; //break
            }
        });
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.showLoadingPage = function(page) {
        // var traceLabel = "(browse-list.js::showLoadingPage)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::showLoadingPage");
        var self = this;
        var loadingPos = 0;

        //find an open loading node
        var $loadingNode = null;
        $.each(self.loadingNodes, function(i, node) {
            var thisPage = $(node).attr('data-page');
            if (_.isUndefined(thisPage) || thisPage == '') {
                $loadingNode = $(node);
                return false; //break
            }
        });

        //figure out if this page has already been drawn
        var $existingPage = null;
        $.each(self.listNodes, function(i, node) {
            var thisPage = $(node).attr('data-page');
            if (!_.isUndefined(thisPage)) {
                if (thisPage == page) {
                    $existingPage = $(node);
                    return false; //break
                }
            }
        });

        //console.log($loadingNode, $existingPage);

        if (!_.isNull($loadingNode)) {
            if (!_.isNull($existingPage)) {
                loadingPos = Math.floor($existingPage.offset().top + $existingPage.height() + ((self.pageHeight - ($existingPage.height())) / 2)) - 15;
                $loadingNode.attr('data-page', page).addClass('active').css({'top': loadingPos});
            } else {
                if (page == 1) {
                    loadingPos = Math.floor(self.offset + (($(window).height() - self.offset) / 2)) - 15;
                } else if (page == self.maxPages) {
                    loadingPos =  Math.floor(self.getPositionFromPage(page) + (self.lastPageHeight / 2)) - 15;
                } else {
                    loadingPos = Math.floor(self.getPositionFromPage(page) + (self.pageHeight / 2)) - 15;
                }
                $loadingNode.attr('data-page', page).addClass('active').css({'top': loadingPos});
            }
        } else {
            //this should probably never happen
            //console.log('error - all loading nodes occupied');
            // utility.trace("All loading nodes occupied", traceLabel, "ERROR");
        }
        // utility.trace(loadingPos, traceLabel, "loadingPos");
        // utility.benchMark(traceLabel, t1, performance.now());
        //return $loadingNode;
    };

    BrowseList.prototype.resetList = function() {
        // var traceLabel = "(browse-list.js::resetList)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::resetList");
        var self = this;

        //console.log('reset list called');

        //if (!_.isNull(self.steady)) {
        //    self.steady.stop();
        //}
        //$listNode = $(self.listNode);

        $(window).scrollTop(0);
        for (var i=0; i<self.listNodes.length;i++) {
            $(self.listNodes[i]).empty().attr('data-page', '').css({'height': 'auto'});
        }
        self.renderedPages = {1: true};
        self.page = 1;
        self.fonts = {};
        //self.pageLock = false;
        //self.maxPages = Math.ceil(self.fonts.family_count / 20);
        $('.browse-list-cont', self.domNode).height($(window).height());
        // utility.trace(self, traceLabel, "self");
        self.maxPages = 1;

        //$listNode.height =
        if (self.config == 'survey') {
            self.lastSelected = false;
            self.selectedArray = [];
            self.emit('reset-selected');
        }

        if (!_.isUndefined(self.fonts['fontfamilies']) && self.fonts.fontfamilies.length == 0) {
            $('.browse-list-cont', self.domNode).addClass('empty');
        } else {
            $('.browse-list-cont', self.domNode).removeClass('empty');
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.updateListItems = function(fonts) {
        // var traceLabel = "(browse-list.js::updateListItems)";
        // var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::updateListItems");
        var self = this;

        //console.log('update list items called');

        //if (!_.isUndefined(componentState.model.languages)) {
        //	self.filter_languages = componentState.model.languages;
        //}

        //console.log('update list items');

        //$(this.domNode).empty();
        self.fonts = fonts;

        self.initFlag = true;
        self.recalculatePage();
        //self.resetList();

        var listNode = self.getListNode(self.page);

        self.displayFonts(self.fonts.fontfamilies, listNode, false);
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.setTextSize = function(textSize, recalculateFlag) {
        // var traceLabel = "(browse-list.js::setTextSize)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::setTextSize");
        var self = this;

        self.textSize = textSize;
        //to-do: only for the page you're on ... keep showing row you're on
        // change history, save state
        $('.fontface-sample', self.domNode).css({'fontSize': textSize+'px'});
        //$(self.domNode).css({'fontSize': textSize+'px'});

        //console.log('set text size', textSize);
        if (recalculateFlag) {
            self.recalculatePage();
        }
    };

    BrowseList.prototype.setSample = function(sample) {
        // var traceLabel = "(browse-list.js::setSample)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::setSample");
        var self = this;
        self.sample = sample;
    };

    BrowseList.prototype.setTextColor = function(textColor) {
        // var traceLabel = "(browse-list.js::setTextColor)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::setTextColor");
        var self = this;

        self.textColor = textColor;


        //to-do:
        // change history, save state

        if (textColor == 'inverted') {
            $('.browse-list-list', self.domNode).addClass('inverted');
            $('body').addClass('inverted');
        } else {
            $('.browse-list-list', self.domNode).removeClass('inverted');
            $('body').removeClass('inverted');
        }
    };

    BrowseList.prototype.setDetailsVisibility = function(detailsVisibility) {
        // var traceLabel = "(browse-list.js::setDetailsVisibility)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::setDetailsVisibility");
        var self = this;
        self.detailsVisibility = detailsVisibility;

        if (detailsVisibility == 'hidden') {
            $('.browse-list-list', self.domNode).addClass('details-hidden');
        } else {
            $('.browse-list-list', self.domNode).removeClass('details-hidden');
        }
    };

    BrowseList.prototype.setLayout = function(layoutType, callRecalc) {
        // var traceLabel = "(browse-list.js::setLayout)";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::setLayout");
        var self = this;

        self.layoutType = layoutType;

        //console.log('set layout called')

        //to-do:
        // change history, save state
        // make it look good

        if (layoutType == 'grid') {
            $('.browse-list-list', self.domNode).addClass('grid');
        } else {
            $('.browse-list-list', self.domNode).removeClass('grid');
        }

        //console.log('set layout');
        if (callRecalc) {
            self.recalculatePage();
        }
        // utility.benchMark(traceLabel, t1, performance.now());
    };

    BrowseList.prototype.moveTop = function(newOffset) {
        // var traceLabel = "browse-list.js::moveTop";
		// var t1 = performance.now();
        // utility.trace("", traceLabel, "browse-list.js::moveTop");
        var self = this;

        //console.log('move top', newOffset)

        var lastOffset = self.offset;
        var difference = newOffset - lastOffset;

        if (lastOffset != newOffset) {
            $(self.domNode).css({paddingTop: newOffset+'px'});
            $.each(self.listNodes, function(i, listNode) {
                var thisTop = $(listNode).css('top');
                if (thisTop != 'auto') {
                    if (thisTop.indexOf('px') != -1) {
                        thisTop = parseInt(thisTop.substr(0, thisTop.length - 2));
                    }
                    $(listNode).addClass('transitioning').css({'top': (thisTop + difference)+'px'});
                    setTimeout(function() {
                        $(listNode).removeClass('transitioning');
                    }, 200);
                }
            });

            self.offset = newOffset;
        }
    };
    return BrowseList;
});
