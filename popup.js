// 获取目标标签页的函数
async function getTargetTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({url: 'https://www.itdog.cn/http/*'}, async function(tabs) {
            try {
                if (tabs && tabs.length > 0) {
                    console.log('Found existing tab');
                    // 检查内容脚本是否已注入
                    try {
                        await checkContentScript(tabs[0].id);
                        resolve(tabs[0]);
                    } catch (error) {
                        console.log('Trying to reinject content script');
                        // 如果内容脚本未注入，重新注入
                        await injectContentScript(tabs[0].id);
                        resolve(tabs[0]);
                    }
                } else {
                    console.log('Creating new tab');
                    // 自动创建新标签页
                    chrome.tabs.create({url: 'https://www.itdog.cn/http/'}, function(tab) {
                        // 等待页面加载完成
                        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                            if (tabId === tab.id && info.status === 'complete') {
                                chrome.tabs.onUpdated.removeListener(listener);
                                console.log('New tab loaded, injecting content script');
                                // 注入内容脚本并等待
                                setTimeout(async () => {
                                    try {
                                        await injectContentScript(tab.id);
                                        resolve(tab);
                                    } catch (error) {
                                        console.log('Error after creating new tab:', error);
                                        reject(error);
                                    }
                                }, 2000);
                            }
                        });
                    });
                }
            } catch (error) {
                console.log('Error in getTargetTab:', error);
                reject(error);
            }
        });
    });
}

// 检查内容脚本是否已注入
function checkContentScript(tabId) {
    return new Promise((resolve, reject) => {
        try {
            chrome.tabs.sendMessage(tabId, { action: 'checkReady' }, response => {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready, trying to inject...');
                    injectContentScript(tabId)
                        .then(resolve)
                        .catch(reject);
                } else if (response && response.ready) {
                    resolve(true);
                } else {
                    reject(new Error('Content script not ready'));
                }
            });
        } catch (error) {
            console.log('Error checking content script:', error);
            reject(error);
        }
    });
}

// 注入内容脚本
function injectContentScript(tabId) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        }).then(() => {
            console.log('Content script injected successfully');
            // 等待内容脚本初始化
            setTimeout(() => {
                checkContentScript(tabId)
                    .then(resolve)
                    .catch(reject);
            }, 2000);
        }).catch(error => {
            console.log('Error injecting content script:', error);
            reject(error);
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const xpathInput = document.getElementById('xpathInput');
    const scrapeButton = document.getElementById('scrapeButton');
    const clickXpathInput = document.getElementById('clickXpathInput');
    const clickButton = document.getElementById('clickButton');
    const columnXpathInput = document.getElementById('columnXpathInput');
    const extractButton = document.getElementById('extractButton');
    const scrapeResultDiv = document.getElementById('scrapeResult');
    const clickResultDiv = document.getElementById('clickResult');
    const extractResultDiv = document.getElementById('extractResult');
    
    // 網域區域元素
    const domainInput = document.getElementById('domainInput');
    const inputXpathInput = document.getElementById('inputXpathInput');
    const submitXpathInput = document.getElementById('submitXpathInput');
    const fillSubmitButton = document.getElementById('fillSubmitButton');
    const fillSubmitResult = document.getElementById('fillSubmitResult');
    
    const logDiv = document.getElementById('log');

    // 新增檔案上傳和處理按鈕
    const domainFile = document.getElementById('domainFile');
    const processDomainsButton = document.getElementById('processDomainsButton');
    
    // 批次處理網域
    let domains = [];  // 儲存所有要處理的網域
    let currentIndex = 0;  // 當前處理的網域索引
    let isProcessing = false;  // 是否正在處理
    
    // 在文件開頭添加一個陣列來存儲所有的 CSV 資料
    let batchResults = [];
    
    const paramFile = document.getElementById('paramFile');
    const loadParamsButton = document.getElementById('loadParamsButton');

    // 添加開始時間變數
    let processStartTime;

    // 緩慢測試等待秒數
    const stopTimeSecInput = document.getElementById('stopTimeSecInput');

    // 在文件开头添加一个 Map 来存储域名和结果
    let domainResultMap = new Map();

    // 在文件开头添加变量声明
    const writeEmptyToCSVCheckbox = document.getElementById('writeEmptyToCSV');

    // 在初始加载时读取存储的设置
    chrome.storage.local.get(['writeEmptyToCSV'], function(data) {
        if (data.writeEmptyToCSV !== undefined) {
            writeEmptyToCSVCheckbox.checked = data.writeEmptyToCSV;
        }
    });

    // 添加 checkbox 变更事件监听器
    writeEmptyToCSVCheckbox.addEventListener('change', function() {
        chrome.storage.local.set({
            writeEmptyToCSV: this.checked
        });
        writeLog(`已${this.checked ? '啟用' : '停用'}訪問失敗空白寫入CSV`);
    });

    function writeLog(message) {
        const time = new Date().toLocaleTimeString();
        const logLine = `[${time}] ${message}`;
        
        // 添加新的日誌行
        const div = document.createElement('div');
        div.textContent = logLine;
        logDiv.insertBefore(div, logDiv.firstChild);
        
        // 確保滾動到最新的日誌
        logDiv.scrollTop = 0;
    }

    // 載入所有保存的值
    chrome.storage.local.get([
        'scrapeXPath', 
        'clickXPath', 
        'columnXPath',
        'domainValue',      // 網域值
        'inputXPath',       // 輸入框XPath
        'submitXPath',      // 提交按鈕XPath
        'submitSlowXPath',  // 慢測試鈕XPath
        'stopTimeSec'       // 緩慢測試等待秒數
    ], function(data) {
        if (data.scrapeXPath) {
            xpathInput.value = data.scrapeXPath;
        }
        if (data.clickXPath) {
            clickXpathInput.value = data.clickXPath;
        }
        if (data.columnXPath) {
            columnXpathInput.value = data.columnXPath;
        }
        // 載入網域區域的值
        if (data.domainValue) {
            domainInput.value = data.domainValue;
        }
        if (data.inputXPath) {
            inputXpathInput.value = data.inputXPath;
        }
        if (data.submitXPath) {
            submitXpathInput.value = data.submitXPath;
        }
        if (data.submitSlowXPath) {
            submitSlowXpathInput.value = data.submitSlowXPath;
        }
        if (data.stopTimeSec) {
            stopTimeSecInput.value = data.stopTimeSec;
        }
        writeLog('已載入所有保存的值');
    });

    // 保存輸入值
    xpathInput.addEventListener('input', function() {
        chrome.storage.local.set({
            scrapeXPath: xpathInput.value
        });
        writeLog('已保存爬取XPath');
    });

    clickXpathInput.addEventListener('input', function() {
        chrome.storage.local.set({
            clickXPath: clickXpathInput.value
        });
        writeLog('已保存點擊XPath');
    });

    columnXpathInput.addEventListener('input', function() {
        chrome.storage.local.set({
            columnXPath: columnXpathInput.value
        });
        writeLog('已保存頡取XPath');
    });

    // 網域區域的輸入保存
    domainInput.addEventListener('input', function() {
        chrome.storage.local.set({
            domainValue: domainInput.value
        });
        writeLog('已保存網域值');
    });

    inputXpathInput.addEventListener('input', function() {
        chrome.storage.local.set({
            inputXPath: inputXpathInput.value
        });
        writeLog('已保存輸入框XPath');
    });

    submitXpathInput.addEventListener('input', function() {
        chrome.storage.local.set({
            submitXPath: submitXpathInput.value
        });
        writeLog('已保存提交按鈕XPath');
    });

    // 爬取功能
    scrapeButton.addEventListener('click', async function() {
        const xpath = xpathInput.value;
        const clickXpath = clickXpathInput.value;
        
        if (!xpath) {
            scrapeResultDiv.textContent = '請輸入XPath';
            writeLog('錯誤：未輸入爬取XPath');
            return;
        }
        
        writeLog('開始爬取...');
        try {
            const targetTab = await getTargetTab();
            
            // 发送消息到内容脚本
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(targetTab.id, {
                    action: 'scrape',
                    xpath: xpath
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });

            if (response && response.result) {
                scrapeResultDiv.textContent = response.result;
                writeLog('爬取成功');

                // 开始监控进度
                let checkCount = 0;
                const maxChecks = 30;
                const checkInterval = setInterval(async () => {
                    checkCount++;
                    try {
                        const progressResponse = await new Promise((resolve, reject) => {
                            chrome.tabs.sendMessage(targetTab.id, {
                                action: 'scrape',
                                xpath: xpath
                            }, response => {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                } else {
                                    resolve(response);
                                }
                            });
                        });

                        if (progressResponse && progressResponse.result) {
                            scrapeResultDiv.textContent = progressResponse.result;
                            
                            if (progressResponse.result.includes('100%')) {
                                clearInterval(checkInterval);
                                writeLog('進度達到100%，執行點擊操作');
                                
                                if (clickXpath) {
                                    setTimeout(async () => {
                                        try {
                                            const clickResponse = await new Promise((resolve, reject) => {
                                                chrome.tabs.sendMessage(targetTab.id, {
                                                    action: 'click',
                                                    xpath: clickXpath
                                                }, response => {
                                                    if (chrome.runtime.lastError) {
                                                        reject(chrome.runtime.lastError);
                                                    } else {
                                                        resolve(response);
                                                    }
                                                });
                                            });

                                            if (clickResponse && clickResponse.result) {
                                                clickResultDiv.textContent = clickResponse.result;
                                                writeLog('點擊操作：' + clickResponse.result);

                                                if (clickResponse.result === '點擊成功') {
                                                    setTimeout(() => {
                                                        writeLog('開始執行頡取操作...');
                                                        extractButton.click();
                                                    }, 1000);
                                                }
                                            }
                                        } catch (error) {
                                            console.error('Error clicking:', error);
                                            writeLog('點擊錯誤：' + error.message);
                                        }
                                    }, 500);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error checking progress:', error);
                        clearInterval(checkInterval);
                        writeLog('檢查進度時發生錯誤：' + error.message);
                    }
                }, 1000);
            } else {
                scrapeResultDiv.textContent = '未找到匹配元素';
                writeLog('爬取失敗：未找到匹配元素');
            }
        } catch (error) {
            scrapeResultDiv.textContent = '發生錯誤：' + error.message;
            writeLog('爬取錯誤：' + error.message);
        }
    });

    // 擊功能
    clickButton.addEventListener('click', async function() {
        const xpath = clickXpathInput.value;
        const extractXpath = columnXpathInput.value;  // 獲取頡取XPath

        if (!xpath) {
            clickResultDiv.textContent = '請輸入要點擊的元素XPath';
            writeLog('錯誤：未輸入點擊XPath');
            return;
        }

        writeLog('開始點擊操作...');
        try {
            const targetTab = await getTargetTab();
            
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(targetTab.id, {
                    action: 'click',
                    xpath: xpath
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            clickResultDiv.textContent = response.result;
            writeLog('點擊操作：' + response.result);

            // 如果點擊成功有頡取XPath，則執行頡取
            if (response.result === '點擊成功' && extractXpath) {
                setTimeout(async () => {
                    writeLog('開始執行頡取操作...');
                    try {
                        const extractResponse = await new Promise((resolve, reject) => {
                            chrome.tabs.sendMessage(targetTab.id, {
                                action: 'extractColumn',
                                xpath: extractXpath
                            }, response => {
                                if (chrome.runtime.lastError) {
                                    reject(chrome.runtime.lastError);
                                } else {
                                    resolve(response);
                                }
                            });
                        });
                        
                        if (extractResponse && extractResponse.result) {
                            extractResultDiv.textContent = extractResponse.result;
                            writeLog('頡取成功：找到 ' + extractResponse.count + ' 個值');
                        } else {
                            extractResultDiv.textContent = '未找到匹內容';
                            writeLog('頡取失敗：未找到匹配內容');
                        }
                    } catch (error) {
                        extractResultDiv.textContent = '發生錯誤：' + error.message;
                        writeLog('頡取錯誤：' + error.message);
                    }
                }, 1000);
            }
        } catch (error) {
            clickResultDiv.textContent = '發生錯誤：' + error.message;
            writeLog('點擊錯誤：' + error.message);
        }
    });

    // 頡取功能
    extractButton.addEventListener('click', async function() {
        const xpath = columnXpathInput.value;
        const domain = domainInput.value;
        
        if (!xpath) {
            extractResultDiv.textContent = '請輸入欄位XPath';
            writeLog('錯誤：未輸入欄位XPath');
            return;
        }

        writeLog('開始頡取欄位數據...');
        try {
            const targetTab = await getTargetTab();
            
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(targetTab.id, {
                    action: 'extractColumn',
                    xpath: xpath
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });

            const result = response?.result || '無結果';
            extractResultDiv.textContent = result;
            const count = response?.count || 0;
            writeLog(`頡取完成：找到 ${count} 個值`);

            // 如果是批处理模式，将结果存入 Map
            if (isProcessing && domain) {
                domainResultMap.set(domain, result);
                writeLog(`已記錄網域 ${domain} 的結果`);
            } else if (!isProcessing && domain) {
                // 单域名处理模式
                const now = new Date().toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                
                // 处理结果格式
                let formattedResult = result;
                if (result === '無結果') {
                    formattedResult = '';
                } else if (result) {
                    formattedResult = result
                        .replace(/\s*\.\s*/g, '.') // 移除点号前后的空格
                        .replace(/\n/g, ' ')       // 将换行替换为空格
                        .trim();                   // 移除首尾空格
                }
                
                const csvRow = `${now},${domain},${formattedResult}`;
                let fileName = domain.replace(/^https?:\/\//, '').replace(/\./g, '_');
                
                chrome.storage.local.get(['isSlowTest'], function(data) {
                    const testType = data.isSlowTest ? '緩慢測試' : '快速測試';
                    fileName = `${fileName}_${testType}`;
                    handleSingleFileDownload(fileName, csvRow);
                });
            }
        } catch (error) {
            extractResultDiv.textContent = '發生錯誤：' + error.message;
            writeLog('頡取錯誤：' + error.message);
            
            // 如果是批处理模式，即使发生错误也要记录
            if (isProcessing && domain) {
                domainResultMap.set(domain, '提取錯誤');
                writeLog(`已記錄網域 ${domain} 的錯誤狀態`);
            }
        }
    });

    // 網域填寫提交功能
    fillSubmitButton.addEventListener('click', async function() {
        const domain = domainInput.value;
        const inputXpath = inputXpathInput.value;
        const submitXpath = submitXpathInput.value;
        const progressXpath = xpathInput.value;
        const targetXpath = clickXpathInput.value;

        if (!domain || !inputXpath || !submitXpath) {
            fillSubmitResult.textContent = '請填寫完整資訊';
            writeLog('錯誤：未填寫完整資訊');
            return;
        }

        writeLog('開始填寫提交操作...');
        try {
            const targetTab = await getTargetTab();
            
            // 發送消息到 content script
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(targetTab.id, {
                    action: 'fillSubmit',
                    domain: domain,
                    inputXpath: inputXpath,
                    submitXpath: submitXpath,
                    progressXpath: progressXpath,
                    targetXpath: targetXpath
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            fillSubmitResult.textContent = response.result;
            writeLog('填寫提交操作：' + response.result);
            
            // 等待頁面重新載入完成
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 重新注入 content script
            try {
                await injectContentScript(targetTab.id);
                writeLog('重新注入 content script 成功');
                
                // 等待檢查進度
                let checkCount = 0;
                const maxChecks = 30;
                const checkInterval = setInterval(async () => {
                    checkCount++;
                    try {
                        const progressResponse = await new Promise((resolve, reject) => {
                            chrome.tabs.sendMessage(targetTab.id, {
                                action: 'checkProgress',
                                xpath: progressXpath
                            }, function(response) {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                    return;
                                }
                                resolve(response);
                            });
                        });

                        if (progressResponse && progressResponse.found) {
                            clearInterval(checkInterval);
                            writeLog('找到進度元素，開始爬取...');
                            chrome.storage.local.set({ isSlowTest: false }, function() {
                                scrapeButton.click();
                            });
                        } else if (checkCount >= maxChecks) {
                            clearInterval(checkInterval);
                            writeLog('等待超時，未找到進度元素');
                            chrome.storage.local.remove(['isSlowTest'], function() {
                                writeLog('已清除測試標記');
                            });
                        }
                    } catch (error) {
                        // 如果發生連接錯誤，嘗試重新注入 content script
                        if (error.message.includes('Receiving end does not exist')) {
                            try {
                                await injectContentScript(targetTab.id);
                                writeLog('重新注入 content script 成功，繼續檢查進度');
                                // 繼續檢查，不中斷 interval
                            } catch (injectError) {
                                clearInterval(checkInterval);
                                writeLog('重新注入 content script 失敗：' + injectError.message);
                                chrome.storage.local.remove(['isSlowTest']);
                            }
                        } else {
                            clearInterval(checkInterval);
                            writeLog('檢查進度時發生錯誤：' + error.message);
                            chrome.storage.local.remove(['isSlowTest'], function() {
                                writeLog('已清除測試標記');
                            });
                        }
                    }
                }, 1000);

            } catch (error) {
                writeLog('重新注入 content script 失敗：' + error.message);
            }

        } catch (error) {
            fillSubmitResult.textContent = '發生錯誤：' + error.message;
            writeLog('填寫提交錯誤：' + error.message);
        }
    });

    // 修改緩慢測試按鈕點擊事件
    fillSubmitSlowButton.addEventListener('click', async function() {
        const domain = domainInput.value;
        const inputXpath = inputXpathInput.value;
        const submitXpath = submitSlowXpathInput.value;
        const progressXpath = xpathInput.value;
        const targetXpath = clickXpathInput.value;
        const stopTimeSec = parseInt(stopTimeSecInput.value) || 60;

        if (!domain || !inputXpath || !submitXpath) {
            fillSubmitResult.textContent = '請填寫完整資訊';
            writeLog('錯誤：未填寫完整資訊');
            return;
        }

        writeLog('開始緩慢測試填寫提交操作...');
        try {
            const targetTab = await getTargetTab();
            
            // 發送消息到 content script
            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(targetTab.id, {
                    action: 'fillSubmit',
                    domain: domain,
                    inputXpath: inputXpath,
                    submitXpath: submitXpath,
                    progressXpath: progressXpath,
                    targetXpath: targetXpath
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });

            fillSubmitResult.textContent = response.result;
            writeLog('緩慢測試填寫提交操作：' + response.result);

            // 等待頁面重新載入完成
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 重新注入 content script
            try {
                await injectContentScript(targetTab.id);
                writeLog('重新注入 content script 成功');
                
                // 等待並檢查進度
                const stopTime = stopTimeSec * 1000;
                let checkCount = 0;
                const maxChecks = 50000;

                const checkInterval = setInterval(async () => {
                    checkCount++;
                    try {
                        const progressResponse = await new Promise((resolve, reject) => {
                            chrome.tabs.sendMessage(targetTab.id, {
                                action: 'checkProgress',
                                xpath: progressXpath
                            }, function(response) {
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                    return;
                                }
                                resolve(response);
                            });
                        });

                        if (progressResponse && progressResponse.found) {
                            clearInterval(checkInterval);
                            writeLog(`找到進度元素，等待${stopTimeSec}秒後開始爬取...`);
                            setTimeout(() => {
                                chrome.storage.local.set({ isSlowTest: true }, function() {
                                    scrapeButton.click();
                                });
                            }, stopTime);
                        } else if (checkCount >= maxChecks) {
                            clearInterval(checkInterval);
                            writeLog('等待超時，未找到進度元素');
                            chrome.storage.local.remove(['isSlowTest'], function() {
                                writeLog('已清除緩慢測試標記');
                            });
                        }
                    } catch (error) {
                        // 如果發生連接錯誤，嘗試重新注入 content script
                        if (error.message.includes('Receiving end does not exist')) {
                            try {
                                await injectContentScript(targetTab.id);
                                writeLog('重新注入 content script 成功，繼續檢查進度');
                                // 繼續檢查，不中斷 interval
                            } catch (injectError) {
                                clearInterval(checkInterval);
                                writeLog('重新注入 content script 失敗：' + injectError.message);
                                chrome.storage.local.remove(['isSlowTest']);
                            }
                        } else {
                            clearInterval(checkInterval);
                            writeLog('檢查進度時發生錯誤：' + error.message);
                            chrome.storage.local.remove(['isSlowTest'], function() {
                                writeLog('已清除緩慢測試標記');
                            });
                        }
                    }
                }, 1000);

            } catch (error) {
                writeLog('重新注入 content script 失敗：' + error.message);
            }

        } catch (error) {
            fillSubmitResult.textContent = '發生錯誤：' + error.message;
            writeLog('填寫提交錯誤：' + error.message);
        }
    });

    // 處理單個網域的數
    async function processDomain(domain) {
        return new Promise((resolve, reject) => {
            const remainingCount = domains.length - currentIndex - 1;
            writeLog(`開始處理網域：${domain}`);
            writeLog(`剩餘待處理數量：${remainingCount}`);
            
            // 設置網域值
            domainInput.value = domain;
            
            // 觸發填寫提交按鈕點擊
            fillSubmitButton.click();
            
            // 修改監聽邏輯，使用自定義事件來追蹤完成
            const checkExtractComplete = setInterval(() => {
                if (extractResultDiv.textContent && !isProcessing) {
                    clearInterval(checkExtractComplete);
                    // 不要在這裡觸發單網域的 CSV 下載
                    writeLog(`網域處理完成：${domain}`);
                    writeLog(`剩餘待處理數量：${remainingCount}`);
                    resolve();
                }
            }, 500);
            
            // 設置超時處理
            setTimeout(() => {
                clearInterval(checkExtractComplete);
                writeLog(`網域 ${domain} 處理超時（還剩 ${remainingCount} 個待處理）`);
                resolve();
            }, 20000);
        });
    }
    
    // 添加一個格式化時間的輔助函數
    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    
    // 修改 Map 转换为 CSV 的逻辑
    function mapToCsvRows(domainResultMap) {
        return Array.from(domainResultMap.entries()).map(([domain, result]) => {
            const now = new Date().toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            const formattedResult = formatResultForCSV(result);
            
            // 根据 checkbox 状态决定是否包含空白结果
            if (!writeEmptyToCSVCheckbox.checked && !formattedResult) {
                return null;
            }
            
            return `${now},${domain},${formattedResult}`;
        }).filter(row => row !== null); // 过滤掉空行
    }

    // 修改快速批次处理函数
    async function processAllDomains() {
        if (isProcessing) return;
        isProcessing = true;
        batchResults = [];
        domainResultMap.clear(); // 清空 Map
        
        try {
            processStartTime = new Date();
            writeLog(`開始快速批次處理，共 ${domains.length} 個網域`);
            writeLog(`開始時間：${processStartTime.toLocaleString('zh-TW')}`);
            
            // 首先将所有域名添加到 Map 中
            domains.forEach(domain => {
                domainResultMap.set(domain, '');
            });
            
            for (let i = currentIndex; i < domains.length; i++) {
                currentIndex = i;
                await processDomain(domains[i]);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 处理结束后，将 Map 中的所有结果转换为数组
            const endTime = new Date();
            const duration = (endTime - processStartTime) / 1000;
            const formattedDuration = formatDuration(duration);
            
            // 将 Map 中的结果转换为 CSV 行
            batchResults = mapToCsvRows(domainResultMap);
            
            writeLog(`快速批次處理完成，結束時間：${endTime.toLocaleString('zh-TW')}`);
            writeLog(`總處理時間：${formattedDuration}`);
            writeLog(`處理網域數：${domainResultMap.size}`);
            writeLog(`實際寫入CSV筆數：${batchResults.length}`);
            
            // 下载合并的 CSV 文件
            if (batchResults.length > 0) {
                const now = endTime.toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                
                const fileName = `批次快速_${batchResults.length}筆_itdog网站测速_${now.replace(/[/:]/g, '')}`;
                handleBatchFileDownload(fileName, batchResults.join('\n'));
            } else {
                writeLog('沒有有效的資料需要下載');
            }
            
            // 清理工作
            isProcessing = false;
            currentIndex = 0;
            domains = [];
            batchResults = [];
            domainResultMap.clear();
            clearAllResultsWithoutProcessing();
            
        } catch (error) {
            writeLog(`批次處理發生錯誤：${error.message}`);
            isProcessing = false;
            currentIndex = 0;
            domains = [];
            batchResults = [];
            domainResultMap.clear();
            clearAllResultsWithoutProcessing();
        }
    }
    
    // 檔案上傳處理
    domainFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 更新檔案名稱顯示
        const fileNameDiv = document.querySelector('.file-name');
        fileNameDiv.textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            // 讀取文件內容並分割成行，保持原始格式
            domains = e.target.result
                .split('\n')
                .map(line => line.trim())
                .filter(line => line);  // 只移除空行
                
            // 修正乱码的日志输出
            writeLog(`已載入 ${domains.length} 個網域`);
            // 顯示域名列表
            writeLog(`域名列表：\n${domains.join('\n')}`);
        };
        reader.readAsText(file);
    });
    
    // 添加拖放功能
    const fileUploadLabel = document.querySelector('.file-upload-label');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileUploadLabel.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        fileUploadLabel.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileUploadLabel.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        fileUploadLabel.classList.add('hover');
    }

    function unhighlight(e) {
        fileUploadLabel.classList.remove('hover');
    }

    fileUploadLabel.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (file && file.name.endsWith('.txt')) {
            domainFile.files = dt.files;
            domainFile.dispatchEvent(new Event('change'));
        } else {
            writeLog('請上傳 .txt 檔');
        }
    }
    
    // 開始批次處理按鈕
    processDomainsButton.addEventListener('click', function() {
        if (domains.length === 0) {
            writeLog('請先上傳網域檔案');
            return;
        }
        
        if (!inputXpathInput.value || !submitXpathInput.value) {
            writeLog('請先設定必要的 XPath');
            return;
        }
        
        processAllDomains();
    });

    // 參數檔案上傳處理
    paramFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const params = JSON.parse(e.target.result);
                writeLog('已讀取參數檔案');
                
                // 驗參數檔案格式
                if (validateParams(params)) {
                    // 更新輸入欄位
                    inputXpathInput.value = params.inputXPath || '';
                    submitXpathInput.value = params.submitXPath || '';
                    submitSlowXpathInput.value = params.submitSlowXPath || '';
                    xpathInput.value = params.scrapeXPath || '';
                    clickXpathInput.value = params.clickXPath || '';
                    columnXpathInput.value = params.columnXPath || '';
                    stopTimeSecInput.value = params.stopTimeSec || '60';  // 預設60秒
                    
                    // 保存到 storage
                    chrome.storage.local.set({
                        inputXPath: params.inputXPath,
                        submitXPath: params.submitXPath,
                        submitSlowXPath: params.submitSlowXPath,
                        scrapeXPath: params.scrapeXPath,
                        clickXPath: params.clickXPath,
                        columnXPath: params.columnXPath,
                        stopTimeSec: params.stopTimeSec || '60'  // 預設60秒
                    });
                    
                    writeLog('已更新所有 XPath 參數');
                }
            } catch (error) {
                writeLog('參數檔案格式錯誤：' + error.message);
            }
        };
        reader.readAsText(file);
    });

    // 載入參數按鈕點擊處理
    loadParamsButton.addEventListener('click', function() {
        if (!paramFile.files[0]) {
            writeLog('請選擇參數檔案');
            return;
        }
        paramFile.dispatchEvent(new Event('change'));
    });

    // 驗證參數檔案格式
    function validateParams(params) {
        const requiredFields = [
            'inputXPath', 
            'submitXPath', 
            'submitSlowXPath',
            'scrapeXPath', 
            'clickXPath', 
            'columnXPath',
            'stopTimeSec'  // 新增
        ];
        const missingFields = requiredFields.filter(field => !params[field]);
        
        if (missingFields.length > 0) {
            writeLog('數檔案缺少必要欄位：' + missingFields.join(', '));
            return false;
        }
        
        return true;
    }

    // 折疊功能 - 修改為處理所有折疊區域
    const collapsibleGroups = document.querySelectorAll('.collapsible-group');
    
    collapsibleGroups.forEach(group => {
        const header = group.querySelector('.collapsible-header');
        const content = group.querySelector('.collapsible-content');
        
        // 初始狀態設為折疊
        header.classList.add('collapsed');
        
        header.addEventListener('click', function() {
            this.classList.toggle('collapsed');
            content.classList.toggle('show');
        });
    });

    // 新增緩慢批次處理按鈕
    const processDomainsSlowButton = document.getElementById('processDomainsSlowButton');

    // 批次處所有網域 - 緩慢模式
    async function processAllDomainsSlow() {
        if (isProcessing) return;
        isProcessing = true;
        batchResults = [];
        domainResultMap.clear(); // 清空 Map
        
        try {
            // 記錄開始時間
            processStartTime = new Date();
            writeLog(`開始緩慢批次處理，共 ${domains.length} 個網域`);
            writeLog(`開始時間：${processStartTime.toLocaleString('zh-TW')}`);
            
            // 首先将所有域名添加到 Map 中
            domains.forEach(domain => {
                domainResultMap.set(domain, '');
            });
            
            for (let i = currentIndex; i < domains.length; i++) {
                currentIndex = i;
                await processDomainSlow(domains[i]);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 記錄結束時間和計算耗時
            const endTime = new Date();
            const duration = (endTime - processStartTime) / 1000;
            const formattedDuration = formatDuration(duration);
            
            // 将 Map 中的结果转换为 CSV 行
            batchResults = mapToCsvRows(domainResultMap);
            
            writeLog(`緩慢批次處理完成，結束時間：${endTime.toLocaleString('zh-TW')}`);
            writeLog(`總處理時間：${formattedDuration}`);
            writeLog(`處理網域數：${domainResultMap.size}`);
            writeLog(`實際寫入CSV筆數：${batchResults.length}`);
            
            // 下載合併的 CSV 檔案
            if (batchResults.length > 0) {
                const now = endTime.toLocaleString('zh-TW', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                const fileName = `批次緩慢_${batchResults.length}筆_itdog网站测速_${now.replace(/[/:]/g, '')}`;
                handleBatchFileDownload(fileName, batchResults.join('\n'));
            } else {
                writeLog('沒有有效的資料需要下載');
            }
            
            // 清理工作
            isProcessing = false;
            currentIndex = 0;
            domains = [];
            batchResults = [];
            domainResultMap.clear();
            domainFile.value = '';
            clearAllResultsWithoutProcessing();
            
        } catch (error) {
            writeLog(`緩慢批次處理發生錯誤：${error.message}`);
            isProcessing = false;
            currentIndex = 0;
            domains = [];
            batchResults = [];
            domainResultMap.clear();
            domainFile.value = '';
            clearAllResultsWithoutProcessing();
        }
    }

    // 處理個網域 - 緩慢模式
    async function processDomainSlow(domain) {
        return new Promise((resolve, reject) => {
            const remainingCount = domains.length - currentIndex - 1;
            writeLog(`開始處理網域：${domain}`);
            writeLog(`剩餘待處理數量：${remainingCount}`);
            
            // 設置網域值
            domainInput.value = domain;
            
            // 觸發緩慢測試按鈕點擊
            fillSubmitSlowButton.click();
            
            // 監聽頡取完成事件
            const checkExtractComplete = setInterval(() => {
                if (logDiv.textContent.includes('已下載 CSV 檔案')) {
                    clearInterval(checkExtractComplete);
                    writeLog(`網域處理完成：${domain}`);
                    writeLog(`剩餘待處理數量：${remainingCount}`);
                    resolve();
                }
            }, 500);
            
            // 設置超時處理 - 使用 stopTimeSec 的
            const stopTimeSec = parseInt(stopTimeSecInput.value) || 60;  // 預設60秒
            const timeoutDuration = (stopTimeSec + 30) * 1000; // 額外增加30秒作為緩衝
            
            setTimeout(() => {
                clearInterval(checkExtractComplete);
                writeLog(`網域 ${domain} 緩慢處理超時（還剩 ${remainingCount} 個待處理）`);
                resolve();
            }, timeoutDuration);
        });
    }

    // 緩慢批次處理按鈕點擊事件
    processDomainsSlowButton.addEventListener('click', function() {
        if (domains.length === 0) {
            writeLog('請先上傳網域檔案');
            return;
        }
        
        if (!inputXpathInput.value || !submitSlowXpathInput.value) {
            writeLog('請先設定必要的 XPath');
            return;
        }
        
        processAllDomainsSlow();
    });

    // 清除所有結果的函数
    function clearAllResults() {
        // 清除文件上傳
        domainFile.value = '';
        const fileNameDiv = document.querySelector('.file-name');
        if (fileNameDiv) {
            fileNameDiv.textContent = '';
        }

        // 清空各個結果區域
        fillSubmitResult.textContent = '';
        scrapeResultDiv.textContent = '';
        clickResultDiv.textContent = '';
        extractResultDiv.textContent = '';
    }

    // 在單個文處理完成後清除
    function handleSingleFileDownload(fileName, csvRow) {
        const now = new Date().toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        // 單網域處理使用不同的命名格式
        const finalFileName = `單筆_${fileName}_itdog网站测速_${now.replace(/[/:]/g, '')}`;
        
        // 添加 BOM 標記
        const BOM = '\uFEFF';
        const csvContent = BOM + csvRow;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${finalFileName}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        writeLog(`已下載單筆 CSV 檔案：${finalFileName}.csv`);
        
        clearAllResults();
    }

    // 在批量處理完成後清除
    function handleBatchFileDownload(fileName, csvContent) {
        // 添加 BOM 標記
        const BOM = '\uFEFF';
        const finalContent = BOM + csvContent;
        
        const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${fileName}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        writeLog(`已下載批次 CSV 檔案：${fileName}.csv`);
        writeLog(`總處理資料筆數：${batchResults.length}`);
        
        clearAllResultsWithoutProcessing();
    }

    // 新增一個不會觸發處理的清除函數
    function clearAllResultsWithoutProcessing() {
        // 清除文件上傳
        domainFile.value = '';
        const fileNameDiv = document.querySelector('.file-name');
        if (fileNameDiv) {
            fileNameDiv.textContent = '';
        }

        // 清空各個結果區域
        fillSubmitResult.textContent = '';
        scrapeResultDiv.textContent = '';
        clickResultDiv.textContent = '';
        extractResultDiv.textContent = '';
        
        // 清空網域輸入框，避免觸發單網域處理
        domainInput.value = '';
    }

    // 修改格式化结果的处理逻辑
    function formatResultForCSV(result) {
        if (!result || result === '無結果' || result === '未找到欄位內容' || result === '提取錯誤') {
            return '';
        }
        return result
            .replace(/\s*\.\s*/g, '.') // 移除点号前后的空格
            .replace(/\n/g, ' ')       // 将换行替换为空格
            .trim();                   // 移除首尾空格
    }
}); 