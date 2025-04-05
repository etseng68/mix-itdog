chrome.action.onClicked.addListener(() => {
    // 檢查是否已經有開啟的視窗
    chrome.windows.getAll((windows) => {
        const existingPopup = windows.find(win => 
            win.type === 'popup' && 
            win.title && win.title.includes('WebMix-ITDOG')
        );

        if (existingPopup) {
            // 如果已經有開啟的視窗，就focus它
            chrome.windows.update(existingPopup.id, { 
                focused: true,
                width: 450,
                height: 800
            });
        } else {
            // 創建新的獨立視窗
            chrome.windows.create({
                url: 'popup.html',
                type: 'popup',
                width: 450,
                height: 800,
                left: 100,
                top: 100
            });
        }
    });
}); 