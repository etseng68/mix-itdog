// 初始化標記
let isInitialized = false;

// 初始化函數
function initialize() {
    if (isInitialized) return;
    isInitialized = true;
    console.log('Content script initialized');
}

// 在頁面加載完成時初始化
if (document.readyState === 'complete') {
    initialize();
} else {
    window.addEventListener('load', initialize);
}

// 監聽來自擴展的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Received message:', request.action);
    
    if (request.action === 'checkReady') {
        console.log('Checking if content script is ready');
        sendResponse({ ready: isInitialized });
        return true;
    }
    
    // 確保腳本已初始化
    if (!isInitialized) {
        console.log('Content script not initialized yet');
        sendResponse({ error: 'Content script not initialized' });
        return true;
    }

    // 原有的消息處理邏輯
    if (request.action === 'scrape') {
        try {
            console.log('Scraping with xpath:', request.xpath);
            const xpath = request.xpath;
            const result = document.evaluate(
                xpath, 
                document, 
                null, 
                XPathResult.ANY_TYPE, 
                null
            );

            let node;
            let data = [];
            
            switch (result.resultType) {
                case XPathResult.STRING_TYPE:
                    data.push(result.stringValue);
                    break;
                case XPathResult.NUMBER_TYPE:
                    data.push(result.numberValue);
                    break;
                case XPathResult.BOOLEAN_TYPE:
                    data.push(result.booleanValue);
                    break;
                default:
                    while (node = result.iterateNext()) {
                        data.push(node.textContent.trim());
                    }
            }

            if (data.length > 0) {
                sendResponse({result: data.join('\n')});
            } else {
                sendResponse({result: '未找到匹配內容'});
            }
        } catch (e) {
            console.log('Error in scrape:', e);
            sendResponse({result: '錯誤：' + e.message});
        }
    }
    else if (request.action === 'click') {
        try {
            const xpath = request.xpath;
            const element = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (element) {
                // 確保元素可見且可點擊
                if (element.offsetParent !== null) {
                    element.click();
                    // 添加延遲以確保點擊事件被處理
                    setTimeout(() => {
                        sendResponse({result: '點擊成功'});
                    }, 500);
                } else {
                    sendResponse({result: '元素不可見或不可點擊'});
                }
            } else {
                sendResponse({result: '未找到要點擊的元素'});
            }
        } catch (e) {
            sendResponse({result: '點擊錯誤：' + e.message});
        }
        return true; // 表示我們會異步發送回應
    }
    else if (request.action === 'extractColumn') {
        try {
            const result = document.evaluate(
                request.xpath,
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );

            let values = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                const node = result.snapshotItem(i);
                if (node) {
                    // 獲取所有直接文本節點
                    const walker = document.createTreeWalker(
                        node,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: function(node) {
                                // 排除 SPAN 標籤內的文本
                                if (node.parentElement.tagName === 'SPAN') {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                return NodeFilter.FILTER_ACCEPT;
                            }
                        }
                    );

                    let text = '';
                    let currentNode;
                    while (currentNode = walker.nextNode()) {
                        text += currentNode.textContent.trim() + ' ';
                    }
                    
                    text = text.trim();
                    if (text) {
                        values.push(text);
                    }
                }
            }

            if (values.length > 0) {
                sendResponse({
                    result: values.join(' . '),
                    count: values.length
                });
            } else {
                sendResponse({result: '未找到欄位內容'});
            }
        } catch (e) {
            sendResponse({result: '頡取錯誤：' + e.message});
        }
    }
    else if (request.action === 'fillSubmit') {
        try {
            // 找到輸入框
            const inputElement = document.evaluate(
                request.inputXpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (!inputElement) {
                sendResponse({result: '未找到輸入框'});
                return;
            }

            // 填入網域值
            inputElement.value = request.domain;
            // 觸發 input 事件，確保值被正確設置
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));

            // 找到提交按鈕
            const submitElement = document.evaluate(
                request.submitXpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (!submitElement) {
                sendResponse({result: '已填入值，但未找到提交按鈕'});
                return;
            }

            // 點擊提交按鈕並立即回應
            submitElement.click();
            sendResponse({result: '填寫並提交成功'});

            // 在提交後開始監測進度
            let checkCount = 0;
            const maxChecks = 50; // 最多檢查50次
            const checkInterval = setInterval(() => {
                checkCount++;
                
                try {
                    // 使用 xpathInput 的值來檢查進度
                    const progressElement = document.evaluate(
                        request.progressXpath,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    // 更新進度到頁面上
                    const progressText = progressElement ? progressElement.textContent.trim() : '未找到進度值';
                    const scrapeResult = document.evaluate(
                        "//div[@id='scrapeResult']",
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    if (scrapeResult) {
                        scrapeResult.textContent = '當前進度：' + progressText;
                    }

                    // 如果找到100%進度
                    if (progressElement && progressElement.textContent.trim() === '100%') {
                        clearInterval(checkInterval);
                        
                        if (scrapeResult) {
                            scrapeResult.textContent = '進度完成：100%';
                        }

                        // 使用 clickXpathInput 的值來點擊目標元素
                        const targetElement = document.evaluate(
                            request.targetXpath,
                            document,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null
                        ).singleNodeValue;

                        if (targetElement) {
                            targetElement.click();
                            console.log('進度100%，已點擊目標元素');
                            if (scrapeResult) {
                                scrapeResult.textContent += ' - 已點擊目標��素';
                            }
                        } else {
                            console.log('進度100%，但未找到目標點擊元素');
                            if (scrapeResult) {
                                scrapeResult.textContent += ' - 未找到目標點擊元素';
                            }
                        }
                    }
                } catch (e) {
                    console.log('監測過程發生錯誤：', e);
                    const scrapeResult = document.evaluate(
                        "//div[@id='scrapeResult']",
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    if (scrapeResult) {
                        scrapeResult.textContent = '監測錯誤：' + e.message;
                    }
                }
                
                // 超時停止檢查
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    console.log('監測超時停止');
                    const scrapeResult = document.evaluate(
                        "//div[@id='scrapeResult']",
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null
                    ).singleNodeValue;

                    if (scrapeResult) {
                        scrapeResult.textContent = '監測超時停止';
                    }
                }
            }, 200); // 每200毫秒檢查一次

        } catch (e) {
            sendResponse({result: '填寫提交錯誤：' + e.message});
        }
    }
    else if (request.action === 'checkProgress') {
        try {
            const element = document.evaluate(
                request.xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (element) {
                sendResponse({
                    found: true,
                    value: element.textContent.trim()
                });
            } else {
                sendResponse({found: false});
            }
        } catch (e) {
            sendResponse({found: false, error: e.message});
        }
    }
    return true;
}); 

// 在頁面卸載時清理
window.addEventListener('unload', function() {
    isInitialized = false;
    console.log('Content script cleanup');
}); 