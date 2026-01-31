// Implements a scroll spy system for the ToC, displaying the current section with an indicator and scrolling to it when needed.

// Inspired from https://gomakethings.com/debouncing-your-javascript-events/
function debounced(func: Function) {
    let timeout;
    return () => {
        if (timeout) {
            window.cancelAnimationFrame(timeout);
        }

        timeout = window.requestAnimationFrame(() => func());
    }
}

const headersQuery = ".article-content h1[id], .article-content h2[id], .article-content h3[id], .article-content h4[id], .article-content h5[id], .article-content h6[id]";
const tocQuery = "#TableOfContents"; // The TOC nav element itself is the scroll container
const navigationQuery = "#TableOfContents li";
const activeClass = "active-class";

function scrollToTocElement(tocElement: HTMLElement, scrollableNavigation: HTMLElement) {
    // Calculate positions using getBoundingClientRect for accurate measurements
    const elementRect = tocElement.getBoundingClientRect();
    const containerRect = scrollableNavigation.getBoundingClientRect();

    // Calculate element position relative to the scroll container
    const relativeTop = elementRect.top - containerRect.top;

    // Center the element: current scroll + relative position - (half container height) + (half element height)
    const scrollTop = scrollableNavigation.scrollTop + relativeTop - (containerRect.height / 2) + (elementRect.height / 2);

    scrollableNavigation.scrollTo({
        top: Math.max(0, scrollTop), // Don't scroll to negative values
        behavior: "smooth"
    });
}

type IdToElementMap = { [key: string]: HTMLElement };

function buildIdToNavigationElementMap(navigation: NodeListOf<Element>): IdToElementMap {
    const sectionLinkRef: IdToElementMap = {};
    navigation.forEach((navigationElement: HTMLElement) => {
        const link = navigationElement.querySelector("a");
        if (link) {
            const href = link.getAttribute("href");
            if (href.startsWith("#")) {
                sectionLinkRef[href.slice(1)] = navigationElement;
            }
        }
    });

    return sectionLinkRef;
}

function computeOffsets(headers: NodeListOf<Element>) {
    let sectionsOffsets = [];
    headers.forEach((header: HTMLElement) => { sectionsOffsets.push({ id: header.id, offset: header.offsetTop }) });
    sectionsOffsets.sort((a, b) => a.offset - b.offset);
    return sectionsOffsets;
}

function setupScrollspy() {
    console.log('[Scrollspy] Initializing...');

    let headers = document.querySelectorAll(headersQuery);
    console.log('[Scrollspy] Headers found:', headers.length);
    if (!headers || headers.length === 0) {
        console.warn("[Scrollspy] No header matched query", headersQuery);
        return;
    }

    let scrollableNavigation = document.querySelector(tocQuery) as HTMLElement | undefined;
    console.log('[Scrollspy] TOC element:', scrollableNavigation);
    if (!scrollableNavigation) {
        console.warn("[Scrollspy] No toc matched query", tocQuery);
        return;
    }

    let navigation = document.querySelectorAll(navigationQuery);
    console.log('[Scrollspy] Navigation items found:', navigation.length);
    if (!navigation || navigation.length === 0) {
        console.warn("[Scrollspy] No navigation matched query", navigationQuery);
        return;
    }

    console.log('[Scrollspy] Setup successful! Listening for scroll events...');

    let sectionsOffsets = computeOffsets(headers);

    // We need to avoid scrolling when the user is actively interacting with the ToC. Otherwise, if the user clicks on a link in the ToC,
    // we would scroll their view, which is not optimal usability-wise.
    let tocHovered: boolean = false;
    scrollableNavigation.addEventListener("mouseenter", debounced(() => tocHovered = true));
    scrollableNavigation.addEventListener("mouseleave", debounced(() => tocHovered = false));

    let activeSectionLink: Element;

    let idToNavigationElement: IdToElementMap = buildIdToNavigationElementMap(navigation);

    function scrollHandler() {
        let scrollPosition = document.documentElement.scrollTop || document.body.scrollTop;
        console.log('[Scrollspy] Scroll event - position:', scrollPosition);

        let newActiveSection: HTMLElement | undefined;

        // Find the section that is currently active.
        // It is possible for no section to be active, so newActiveSection may be undefined.
        sectionsOffsets.forEach((section) => {
            if (scrollPosition >= section.offset - 20) {
                newActiveSection = document.getElementById(section.id);
            }
        });

        console.log('[Scrollspy] Active section:', newActiveSection?.id);

        // Find the link for the active section. Once again, there are a few edge cases:
        // - No active section = no link => undefined
        // - No active section but the link does not exist in toc (e.g. because it is outside of the applicable ToC levels) => undefined
        let newActiveSectionLink: HTMLElement | undefined
        if (newActiveSection) {
            newActiveSectionLink = idToNavigationElement[newActiveSection.id];
        }

        if (newActiveSection && !newActiveSectionLink) {
            // The active section does not have a link in the ToC, so we can't scroll to it.
            console.debug("[Scrollspy] No link found for section", newActiveSection);
        } else if (newActiveSectionLink !== activeSectionLink) {
            console.log('[Scrollspy] Changing active section from', activeSectionLink, 'to', newActiveSectionLink);
            if (activeSectionLink)
                activeSectionLink.classList.remove(activeClass);
            if (newActiveSectionLink) {
                newActiveSectionLink.classList.add(activeClass);
                console.log('[Scrollspy] Added active-class to:', newActiveSectionLink);
                if (!tocHovered) {
                    // Scroll so that newActiveSectionLink is in the middle of scrollableNavigation, except when it's from a manual click (hence the tocHovered check)
                    console.log('[Scrollspy] Auto-scrolling TOC to active item');
                    scrollToTocElement(newActiveSectionLink, scrollableNavigation);
                }
            }
            activeSectionLink = newActiveSectionLink;
        }
    }

    window.addEventListener("scroll", debounced(scrollHandler));
    
    // Resizing may cause the offset values to change: recompute them.
    function resizeHandler() {
        sectionsOffsets = computeOffsets(headers);
        scrollHandler();
    }

    // Use ResizeObserver to detect changes in the size of .article-content
    const articleContent = document.querySelector(".article-content");
    if (articleContent) {
        const resizeObserver = new ResizeObserver(debounced(resizeHandler));
        resizeObserver.observe(articleContent);
    }

    window.addEventListener("resize", debounced(resizeHandler));
}

export { setupScrollspy };
