$(document).ready(function() {
    // ========== STATE ==========
    let cachedData = null;
    let currentTimeframe = '1d';
    let favorites = [];
    let isRefreshing = false;

    // ========== DOM REFS ==========
    const $loadingArea = $('#loadingArea');
    const $resultsArea = $('#resultsArea');
    const $stockCards = $('#stockCards');
    const $scanStats = $('#scanStats');
    const $droppedArea = $('#droppedArea');
    const $droppedCards = $('#droppedCards');
    const $droppedStats = $('#droppedStats');
    const $refreshBtn = $('#refreshBtn');
    const $refreshSpinner = $('#refreshSpinner');
    const $refreshIcon = $('#refreshIcon');
    const $refreshText = $('#refreshText');
    const $lastUpdateTime = $('#lastUpdateTime');
    const $favoritesSidebar = $('#favoritesSidebar');
    const $favoritesContainer = $('#favoritesContainer');
    const $favCount = $('#favCount');
    const $favToggleBtn = $('#favToggleBtn');
    const $favToggleCount = $('#favToggleCount');
    const $refreshProgress = $('#refreshProgress');

    // ========== INIT ==========
    let validStocks = [];
    
    // Fetch valid tickers and populate datalist
    $.get('/tickers', function(data) {
        if(Array.isArray(data)) {
            validStocks = data;
            let options = data.map(s => `<option value="${s}">`).join('');
            $('#stockList').html(options);
        }
    });

    // Doğrudan favorileri yükle ve sonuçları getir
    loadFavorites();
    fetchResults();

    // ========== ZAMAN ARALIĞI DEĞİŞTİRME ==========
    $('input[name="timeframe"]').on('change', function() {
        currentTimeframe = $(this).val();
        if (cachedData) {
            renderResults();
        }
    });

    // ========== VERİ ÇEKME ==========
    function fetchResults() {
        $loadingArea.removeClass('d-none');
        $resultsArea.addClass('d-none');

        $.ajax({
            url: '/api/results',
            type: 'GET',
            success: function(response) {
                if (response.status === 'success') {
                    cachedData = response.data;
                    updateLastUpdateDisplay();
                    renderResults();
                    renderFavorites();
                } else {
                    $loadingArea.html(`
                        <div class="text-center py-5">
                            <i class="fas fa-satellite-dish fa-3x text-info mb-3" style="opacity: 0.4;"></i>
                            <p class="text-muted-custom fs-5">Henüz tarama yapılmadı</p>
                            <p class="text-muted-custom">Aşağıdaki "Taramayı Başlat" butonuna basarak verileri yükleyin.</p>
                        </div>
                    `);
                }
            },
            error: function() {
                $loadingArea.html(`
                    <div class="text-center py-5">
                        <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                        <p class="text-muted-custom fs-5">Sunucuya bağlanılamadı</p>
                    </div>
                `);
            }
        });
    }

    // ========== SONUÇLARI RENDER ETME ==========
    function renderResults() {
        $loadingArea.addClass('d-none');
        $stockCards.empty();
        $droppedCards.empty();
        $droppedArea.addClass('d-none');

        if (!cachedData || !cachedData.results) return;

        const tfData = cachedData.results[currentTimeframe];
        if (!tfData || tfData.error) {
            $stockCards.html(`
                <div class="col-12 text-center py-5">
                    <i class="fas fa-exclamation-circle fa-3x text-warning mb-3"></i>
                    <h4 class="text-light">Veri Alınamadı</h4>
                    <p class="text-muted-custom">${tfData ? tfData.error : 'Bu zaman dilimi için veri bulunamadı. Taramayı başlatın.'}</p>
                </div>
            `);
            $resultsArea.removeClass('d-none');
            $scanStats.text('');
            return;
        }

        $scanStats.text(`${tfData.count} / ${tfData.total_scanned} Hisse Mavi Bulutta`);

        if (tfData.count === 0) {
            $stockCards.html(`
                <div class="col-12 text-center py-5">
                    <i class="fas fa-search-minus fa-3x text-light mb-3" style="opacity: 0.3;"></i>
                    <h4 class="text-light">Eşleşen Hisse Bulunamadı</h4>
                    <p class="text-muted-custom">Seçilen zaman aralığında mavi bulut formasyonunda olan hisse senedi yok.</p>
                </div>
            `);
        } else {
            const multiApproved = getMultiApprovedStocks();

            tfData.stocks.forEach(function(stock) {
                const isFav = favorites.includes(stock.symbol);
                const isMulti = multiApproved[stock.symbol];
                const multiCount = isMulti ? isMulti.count : 0;
                const multiTfs = isMulti ? isMulti.timeframes : [];

                let changeBadgeClass = 'neutral';
                let changeIcon = '';
                if (stock.change_pct > 0) {
                    changeBadgeClass = 'positive';
                    changeIcon = '<i class="fas fa-caret-up"></i>';
                } else if (stock.change_pct < 0) {
                    changeBadgeClass = 'negative';
                    changeIcon = '<i class="fas fa-caret-down"></i>';
                }

                let multiBadgeHtml = '';
                if (multiCount >= 2) {
                    const tfLabelsMap = { '1d': '1G', '4h': '4S', '2h': '2S', '1h': '1S' };
                    const tfLabels = multiTfs.map(tf => tfLabelsMap[tf] || tf).join(' · ');
                    multiBadgeHtml = `
                        <div class="mt-2">
                            <span class="multi-badge"><i class="fas fa-fire"></i> Çoklu Onay (${tfLabels})</span>
                        </div>
                    `;
                }

                const enteredSymbols = tfData.entered_symbols || [];
                const isEntered = enteredSymbols.includes(stock.symbol);
                const enteredClass = isEntered ? 'entered' : '';

                const card = `
                    <div class="col-6 col-md-4 col-lg-3 mb-3 stock-card-wrapper">
                        <div class="stock-card p-3 h-100 ${enteredClass}">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div class="stock-symbol">${stock.symbol}</div>
                                <div class="d-flex align-items-center gap-1">
                                    <button class="fav-btn ${isFav ? 'active' : ''}" data-symbol="${stock.symbol}" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                                        <i class="fas fa-star"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-end mb-2">
                                <div>
                                    <div class="card-label">Fiyat</div>
                                    <div class="stock-price">${stock.price.toFixed(2)} ₺</div>
                                </div>
                                <div class="text-end">
                                    <div class="card-label">Günlük</div>
                                    <span class="change-badge ${changeBadgeClass}">
                                        ${changeIcon} %${Math.abs(stock.change_pct).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="squeeze-value" title="Sıkışma Oranı">
                                    <i class="fas fa-compress-alt me-1"></i>%${stock.squeeze.toFixed(1)}
                                </span>
                                <a href="https://www.tradingview.com/chart/?symbol=BIST%3A${stock.symbol}" target="_blank" class="chart-link">
                                    <i class="fas fa-chart-line me-1"></i>Grafik
                                </a>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <span class="indicator-badge ${stock.rsi < 50 ? 'good' : 'bad'}" title="RSI: ${(stock.rsi || 0).toFixed(2)}">
                                    RSI ${stock.rsi < 50 ? '✅' : '❌'}
                                </span>
                                <span class="indicator-badge ${stock.mfi < 50 ? 'good' : 'bad'}" title="MFI: ${(stock.mfi || 0).toFixed(2)}">
                                    MFI ${stock.mfi < 50 ? '✅' : '❌'}
                                </span>
                            </div>
                            ${multiBadgeHtml}
                        </div>
                    </div>
                `;
                $stockCards.append(card);
            });
        }

        const droppedStocks = tfData.dropped_stocks || [];
        if (droppedStocks.length > 0) {
            $droppedStats.text(`${droppedStocks.length} Hisse Düştü`);
            droppedStocks.forEach(function(stock) {
                const isFav = favorites.includes(stock.symbol);
                let changeBadgeClass = 'neutral';
                let changeIcon = '';
                if (stock.change_pct > 0) {
                    changeBadgeClass = 'positive';
                    changeIcon = '<i class="fas fa-caret-up"></i>';
                } else if (stock.change_pct < 0) {
                    changeBadgeClass = 'negative';
                    changeIcon = '<i class="fas fa-caret-down"></i>';
                }

                const card = `
                    <div class="col-6 col-md-4 col-lg-3 mb-3 stock-card-wrapper">
                        <div class="stock-card p-3 h-100 dropped">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div class="stock-symbol">${stock.symbol}</div>
                                <div class="d-flex align-items-center gap-1">
                                    <button class="fav-btn ${isFav ? 'active' : ''}" data-symbol="${stock.symbol}" title="${isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}">
                                        <i class="fas fa-star"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-end mb-2">
                                <div>
                                    <div class="card-label">Fiyat</div>
                                    <div class="stock-price">${stock.price.toFixed(2)} ₺</div>
                                </div>
                                <div class="text-end">
                                    <div class="card-label">Günlük</div>
                                    <span class="change-badge ${changeBadgeClass}">
                                        ${changeIcon} %${Math.abs(stock.change_pct).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="squeeze-value" title="Sıkışma Oranı">
                                    <i class="fas fa-compress-alt me-1"></i>%${stock.squeeze.toFixed(1)}
                                </span>
                                <a href="https://www.tradingview.com/chart/?symbol=BIST%3A${stock.symbol}" target="_blank" class="chart-link">
                                    <i class="fas fa-chart-line me-1"></i>Grafik
                                </a>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mt-2">
                                <span class="indicator-badge ${stock.rsi < 50 ? 'good' : 'bad'}" title="RSI: ${(stock.rsi || 0).toFixed(2)}">
                                    RSI ${stock.rsi < 50 ? '✅' : '❌'}
                                </span>
                                <span class="indicator-badge ${stock.mfi < 50 ? 'good' : 'bad'}" title="MFI: ${(stock.mfi || 0).toFixed(2)}">
                                    MFI ${stock.mfi < 50 ? '✅' : '❌'}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
                $droppedCards.append(card);
            });
            $droppedArea.removeClass('d-none');
        }

        $resultsArea.removeClass('d-none');
    }

    // ========== ÇOKLU ONAY HESAPLAMA ==========
    function getMultiApprovedStocks() {
        if (!cachedData || !cachedData.results) return {};
        const stockMap = {};
        const timeframes = ['1d', '4h', '2h', '1h'];

        timeframes.forEach(function(tf) {
            const tfData = cachedData.results[tf];
            if (!tfData || tfData.error || !tfData.stocks) return;
            tfData.stocks.forEach(function(stock) {
                if (!stockMap[stock.symbol]) {
                    stockMap[stock.symbol] = { count: 0, timeframes: [] };
                }
                stockMap[stock.symbol].count++;
                stockMap[stock.symbol].timeframes.push(tf);
            });
        });

        const result = {};
        Object.keys(stockMap).forEach(function(sym) {
            if (stockMap[sym].count >= 2) {
                result[sym] = stockMap[sym];
            }
        });
        return result;
    }

    // ========== FAVORİLER (Önbellek / LocalStorage) ==========
    const FAVORITES_STORAGE_KEY = 'bbawe_favorites';

    function loadFavorites() {
        try {
            const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                favorites = Array.isArray(parsed) ? parsed : [];
            } else {
                favorites = [];
            }
        } catch (e) {
            console.warn("Önbellekten favoriler okunamadı:", e);
            favorites = [];
        }
        updateFavCounts();
        if (cachedData) renderFavorites();
    }

    function saveFavorites() {
        updateFavCounts();
        try {
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        } catch (e) {
            console.warn("Önbelleğe favoriler kaydedilemedi:", e);
        }
    }

    function updateFavCounts() {
        $favCount.text(favorites.length);
        $favToggleCount.text(favorites.length);
    }

    function toggleFavorite(symbol) {
        const idx = favorites.indexOf(symbol);
        if (idx > -1) {
            favorites.splice(idx, 1);
        } else {
            favorites.push(symbol);
        }
        saveFavorites();
        renderFavorites();
        $(`.fav-btn[data-symbol="${symbol}"]`).toggleClass('active');
    }

    function renderFavorites() {
        $favoritesContainer.empty();

        if (favorites.length === 0) {
            $favoritesContainer.html(`
                <div class="favorites-empty">
                    <i class="fas fa-heart-circle-plus fa-2x mb-3 text-muted-custom"></i>
                    <p class="text-muted-custom mb-0">Henüz hisse eklenmedi</p>
                    <small class="text-muted-custom">Kartlardaki ⭐ ile ekleyin</small>
                </div>
            `);
            return;
        }

        favorites.forEach(function(symbol) {
            const stockInfo = findStockInCache(symbol);
            let priceText = '-';
            let changeHtml = '';
            let squeezeText = '';

            if (stockInfo) {
                priceText = stockInfo.price.toFixed(2) + ' ₺';
                let changeClass = 'text-muted-custom';
                let changePrefix = '';
                if (stockInfo.change_pct > 0) {
                    changeClass = 'change-positive';
                    changePrefix = '+';
                } else if (stockInfo.change_pct < 0) {
                    changeClass = 'change-negative';
                }
                changeHtml = `<span class="fav-change ${changeClass}">${changePrefix}${stockInfo.change_pct.toFixed(2)}%</span>`;
                squeezeText = `<span class="fav-squeeze"><i class="fas fa-compress-alt me-1"></i>%${stockInfo.squeeze.toFixed(1)}</span>`;
            }

            const favCard = `
                <div class="fav-card" data-symbol="${symbol}">
                    <button class="fav-remove" data-symbol="${symbol}" title="Listeden çıkar">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fav-symbol">${symbol}</span>
                        ${changeHtml}
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="fav-price">${priceText}</span>
                        ${squeezeText}
                    </div>
                </div>
            `;
            $favoritesContainer.append(favCard);
        });
    }

    function findStockInCache(symbol) {
        if (!cachedData || !cachedData.results) return null;
        const priorities = ['1d', '4h', '2h', '1h'];
        for (let i = 0; i < priorities.length; i++) {
            const tfData = cachedData.results[priorities[i]];
            if (!tfData || !tfData.stocks) continue;
            const found = tfData.stocks.find(s => s.symbol === symbol);
            if (found) return found;
        }
        return null;
    }

    // ========== EVENT HANDLERS ==========
    $stockCards.on('click', '.fav-btn', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite($(this).data('symbol'));
    });

    $favoritesContainer.on('click', '.fav-remove', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite($(this).data('symbol'));
    });

    // Mobil favori toggle (bottom sheet)
    $favToggleBtn.on('click', function() {
        $favoritesSidebar.toggleClass('open');
        toggleOverlay();
    });

    // Mobil kapatma butonu
    $('#favCloseBtn').on('click', function() {
        closeFavorites();
    });

    function closeFavorites() {
        $favoritesSidebar.removeClass('open');
        let $overlay = $('.sidebar-overlay');
        $overlay.removeClass('active');
        setTimeout(() => $overlay.remove(), 300);
    }

    function toggleOverlay() {
        let $overlay = $('.sidebar-overlay');
        if ($favoritesSidebar.hasClass('open')) {
            if ($overlay.length === 0) {
                $overlay = $('<div class="sidebar-overlay"></div>');
                $('body').append($overlay);
                setTimeout(() => $overlay.addClass('active'), 10);
                $overlay.on('click', function() {
                    closeFavorites();
                });
            }
        } else {
            $overlay.removeClass('active');
            setTimeout(() => $overlay.remove(), 300);
        }
    }

    // ========== MANUEL GÜNCELLEME (Sıralı Timeframe Tarama) ==========
    const TIMEFRAMES = ['1d', '4h', '2h', '1h'];
    const TF_LABELS = { '1d': '1 Günlük', '4h': '4 Saatlik', '2h': '2 Saatlik', '1h': '1 Saatlik' };

    $refreshBtn.on('click', function() {
        if (isRefreshing) return;
        startSequentialScan();
    });

    function startSequentialScan() {
        isRefreshing = true;
        $refreshBtn.prop('disabled', true);
        $refreshSpinner.removeClass('d-none');
        $refreshIcon.addClass('d-none');
        $refreshProgress.removeClass('d-none');

        // Sıralı olarak her timeframe'i tara
        let completedCount = 0;
        
        function scanNext(index) {
            if (index >= TIMEFRAMES.length) {
                // Tamamlandı
                isRefreshing = false;
                $refreshBtn.prop('disabled', false);
                $refreshSpinner.addClass('d-none');
                $refreshIcon.removeClass('d-none');
                $refreshProgress.addClass('d-none');
                $refreshText.text('Taramayı Başlat');

                // Verileri yeniden çek
                fetchResults();
                return;
            }

            const tf = TIMEFRAMES[index];
            $refreshText.text(`${TF_LABELS[tf]} taranıyor...`);
            $refreshProgress.html(`<div class="progress-dots">${TIMEFRAMES.map((t, i) => 
                `<span class="progress-dot ${i < index ? 'done' : i === index ? 'active' : ''}">${{'1d':'1G','4h':'4S','2h':'2S','1h':'1S'}[t]}</span>`
            ).join('')}</div>`);

            $.ajax({
                url: '/api/scan_timeframe',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ timeframe: tf }),
                timeout: 300000, // 5 dakika timeout
                success: function(response) {
                    if (response.status === 'success') {
                        // Cache'i güncelle
                        if (!cachedData) cachedData = { results: {} };
                        cachedData.results[tf] = response.data;
                        cachedData.last_updated_display = response.last_updated_display;
                        
                        // Eğer şu anki seçili timeframe tarandıysa sonuçları göster
                        if (tf === currentTimeframe) {
                            renderResults();
                            renderFavorites();
                        }
                        updateLastUpdateDisplay();
                    }
                    scanNext(index + 1);
                },
                error: function() {
                    console.error('Tarama işlemi başarısız: ' + tf);
                    scanNext(index + 1);
                }
            });
        }

        // Taramayı başlat
        scanNext(0);
    }

    // ========== DRAG AND DROP FAVORITES ==========
    if (typeof Sortable !== 'undefined') {
        new Sortable(document.getElementById('favoritesContainer'), {
            animation: 150,
            ghostClass: 'sortable-ghost',
            handle: '.fav-card',
            onEnd: function() {
                const newOrder = [];
                $('#favoritesContainer .fav-card').each(function() {
                    newOrder.push($(this).data('symbol'));
                });
                favorites = newOrder;
                saveFavorites();
            }
        });
    }

    // ========== DESKTOP SIDEBAR TOGGLE ==========
    $('#favDesktopToggleBtn').on('click', function() {
        $favoritesSidebar.addClass('closed');
        $('.main-content').addClass('expanded');
        $('#desktopFavToggleOpen').show();
    });

    $('#desktopFavToggleOpen').on('click', function() {
        $favoritesSidebar.removeClass('closed');
        $('.main-content').addClass('expanded');
        $(this).hide();
    });

    // ========== FAVORITES SEARCH & ADD ==========
    $('#favAddBtn').on('click', function() {
        let sym = $('#favSearchInput').val().trim().toUpperCase();
        if(sym) {
            if(!validStocks.includes(sym)) {
                alert("Geçersiz hisse kodu girdiniz: " + sym);
                return;
            }
            if(!favorites.includes(sym)) {
                favorites.push(sym);
                saveFavorites();
                renderFavorites();
            }
            $('#favSearchInput').val('');
        }
    });

    $('#favSearchInput').on('keypress', function(e) {
        if(e.which == 13) $('#favAddBtn').click();
    });

    // ========== CUSTOM STOCK SEARCH ==========
    let customStocks = [];

    $('#addCustomStockBtn').on('click', function() {
        let sym = $('#customSearchInput').val().trim().toUpperCase();
        if(sym) {
            if(!validStocks.includes(sym)) {
                alert("Geçersiz hisse kodu girdiniz: " + sym);
                return;
            }
            if(!customStocks.includes(sym)) {
                customStocks.push(sym);
                renderCustomTags();
            }
            $('#customSearchInput').val('');
        }
    });

    $('#customSearchInput').on('keypress', function(e) {
        if(e.which == 13) $('#addCustomStockBtn').click();
    });

    $('#customStockTags').on('click', '.remove-tag', function() {
        let sym = $(this).data('symbol');
        customStocks = customStocks.filter(s => s !== sym);
        renderCustomTags();
        if (customStocks.length === 0) {
            renderResults();
        }
    });

    function renderCustomTags() {
        let $container = $('#customStockTags');
        $container.empty();
        if (customStocks.length > 0) {
            $container.removeClass('empty');
            $('#customScanBtn').removeClass('disabled');
            customStocks.forEach(sym => {
                $container.append(`<span class="custom-tag">${sym} <button class="remove-tag" data-symbol="${sym}"><i class="fas fa-times"></i></button></span>`);
            });
        } else {
            $container.addClass('empty');
            $('#customScanBtn').addClass('disabled');
        }
    }

    $('#customScanBtn').on('click', function() {
        if (customStocks.length === 0) return;
        
        $loadingArea.removeClass('d-none');
        $resultsArea.addClass('d-none');
        $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Taranıyor...');

        $.ajax({
            url: '/api/scan_specific',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ timeframe: currentTimeframe, tickers: customStocks }),
            success: function(res) {
                if (res.status === 'success') {
                    renderSpecificResults(res.data.stocks);
                }
            },
            complete: function() {
                $('#customScanBtn').prop('disabled', false).html('<i class="fas fa-search me-2"></i>Özel Tarama Başlat');
            }
        });
    });

    function renderSpecificResults(stocks) {
        $loadingArea.addClass('d-none');
        $stockCards.empty();
        
        if (!stocks || stocks.length === 0) {
            $stockCards.html('<div class="col-12 text-center py-5">Hisse bulunamadı veya değerleri hesaplanamadı.</div>');
            $resultsArea.removeClass('d-none');
            $scanStats.text('');
            return;
        }

        $scanStats.text(`Özel Tarama: ${stocks.length} Hisse`);
        
        stocks.forEach(function(stock) {
            const isFav = favorites.includes(stock.symbol);
            let changeBadgeClass = 'neutral';
            let changeIcon = '';
            if (stock.change_pct > 0) { changeBadgeClass = 'positive'; changeIcon = '<i class="fas fa-caret-up"></i>'; }
            else if (stock.change_pct < 0) { changeBadgeClass = 'negative'; changeIcon = '<i class="fas fa-caret-down"></i>'; }

            const cloudBadge = stock.in_blue_cloud ? `<span class="badge bg-info mb-2"><i class="fas fa-cloud me-1"></i>Mavi Bulutta</span>` : '';

            const card = `
                <div class="col-6 col-md-4 col-lg-3 mb-3 stock-card-wrapper">
                    <div class="stock-card p-3 h-100">
                        ${cloudBadge}
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="stock-symbol">${stock.symbol}</div>
                            <div class="d-flex align-items-center gap-1">
                                <button class="fav-btn ${isFav ? 'active' : ''}" data-symbol="${stock.symbol}">
                                    <i class="fas fa-star"></i>
                                </button>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between align-items-end mb-2">
                            <div><div class="card-label">Fiyat</div><div class="stock-price">${stock.price.toFixed(2)} ₺</div></div>
                            <div class="text-end"><div class="card-label">Günlük</div><span class="change-badge ${changeBadgeClass}">${changeIcon} %${Math.abs(stock.change_pct).toFixed(2)}</span></div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="squeeze-value"><i class="fas fa-compress-alt me-1"></i>%${stock.squeeze.toFixed(1)}</span>
                            <a href="https://www.tradingview.com/chart/?symbol=BIST%3A${stock.symbol}" target="_blank" class="chart-link"><i class="fas fa-chart-line me-1"></i>Grafik</a>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-2">
                            <span class="indicator-badge ${stock.rsi < 50 ? 'good' : 'bad'}">RSI ${stock.rsi < 50 ? '✅' : '❌'}</span>
                            <span class="indicator-badge ${stock.mfi < 50 ? 'good' : 'bad'}">MFI ${stock.mfi < 50 ? '✅' : '❌'}</span>
                        </div>
                    </div>
                </div>
            `;
            $stockCards.append(card);
        });
        $resultsArea.removeClass('d-none');
    }

    function updateLastUpdateDisplay() {
        if (cachedData && cachedData.last_updated_display) {
            $lastUpdateTime.html(`<i class="fas fa-clock me-1"></i>Son güncelleme: <strong>${cachedData.last_updated_display}</strong>`);
        } else {
            $lastUpdateTime.html('<i class="fas fa-clock me-1"></i>Henüz güncelleme yapılmadı');
        }
    }

    // ========== PWA KURULUM ==========
    const installBtn = $('#installPwaBtn');
    
    const isIos = () => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(userAgent);
    };
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIos() && !isStandalone) {
        installBtn.removeClass('d-none');
        installBtn.html("<i class='fab fa-apple me-2'></i>iPhone'a Yükle");
        installBtn.click(() => {
            alert("iPhone'a yüklemek için:\n\n1. Safari'nin alt kısmındaki 'Paylaş' ikonuna dokunun.\n2. 'Ana Ekrana Ekle' seçeneğini seçin.");
        });
    } else {
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.removeClass('d-none');
        });
        installBtn.click(async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') installBtn.addClass('d-none');
                deferredPrompt = null;
            }
        });
        window.addEventListener('appinstalled', () => {
            installBtn.addClass('d-none');
            deferredPrompt = null;
        });
    }
});
