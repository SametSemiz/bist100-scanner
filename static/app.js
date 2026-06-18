$(document).ready(function() {
    let allTickers = [];
    let selectedStocks = [];

    // Ticker listesini çek
    $.get('/tickers', function(data) {
        allTickers = data;
    });

    const searchInput = $('#searchInput');
    const searchSuggestions = $('#searchSuggestions');
    const selectedStocksContainer = $('#selectedStocksContainer');
    const chunkSelect = $('#chunkSelect');

    function updateUIState() {
        // Tagleri çiz
        selectedStocksContainer.empty();
        selectedStocks.forEach(stock => {
            const tag = `
                <span class="badge bg-primary d-flex align-items-center p-2 fs-6">
                    ${stock}
                    <i class="fas fa-times ms-2 remove-stock" style="cursor:pointer;" data-stock="${stock}"></i>
                </span>
            `;
            selectedStocksContainer.append(tag);
        });

        // Eğer seçili hisse varsa tarama aralığını (chunkSelect) devre dışı bırak
        if (selectedStocks.length > 0) {
            chunkSelect.prop('disabled', true);
        } else {
            chunkSelect.prop('disabled', false);
        }
    }

    searchInput.on('input', function() {
        const val = $(this).val().trim().toUpperCase();
        searchSuggestions.empty();

        if (val.length > 0) {
            const filtered = allTickers.filter(t => t.startsWith(val) && !selectedStocks.includes(t));
            if (filtered.length > 0) {
                filtered.slice(0, 10).forEach(stock => {
                    searchSuggestions.append(`<li class="list-group-item list-group-item-action bg-dark text-light border-secondary" style="cursor:pointer;">${stock}</li>`);
                });
                searchSuggestions.removeClass('d-none');
            } else {
                searchSuggestions.addClass('d-none');
            }
        } else {
            searchSuggestions.addClass('d-none');
        }
    });

    searchSuggestions.on('click', 'li', function() {
        const stock = $(this).text();
        if (!selectedStocks.includes(stock)) {
            selectedStocks.push(stock);
            updateUIState();
        }
        searchInput.val('');
        searchSuggestions.addClass('d-none');
        searchInput.focus();
    });

    selectedStocksContainer.on('click', '.remove-stock', function() {
        const stock = $(this).data('stock');
        selectedStocks = selectedStocks.filter(s => s !== stock);
        updateUIState();
    });

    // Tıklama dışarıya olunca suggestionları kapat
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#searchInput').length && !$(e.target).closest('#searchSuggestions').length) {
            searchSuggestions.addClass('d-none');
        }
    });

    $('#scanBtn').click(function() {
        const btn = $(this);
        const spinner = $('#runSpinner');
        const resultsArea = $('#resultsArea');
        const stockCards = $('#stockCards');
        const scanStats = $('#scanStats');
        const timeframe = $('input[name="timeframe"]:checked').val();
        const chunk = chunkSelect.val();

        // UI Durumunu Güncelle
        btn.prop('disabled', true);
        btn.find('.spinner-border').removeClass('d-none');
        resultsArea.addClass('d-none');
        stockCards.empty();

        $.ajax({
            url: '/scan',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ timeframe: timeframe, chunk: chunk, selected_tickers: selectedStocks }),
            success: function(response) {
                if (response.status === 'success') {
                    const data = response.data;
                    scanStats.text(`${data.count} / ${data.total_scanned} Hisse Mavi Bulutta`);
                    
                    if (data.count === 0) {
                        stockCards.html(`
                            <div class="col-12 text-center py-5">
                                <i class="fas fa-search-minus fa-3x text-light mb-3"></i>
                                <h4 class="text-light">Eşleşen Hisse Bulunamadı</h4>
                                <p class="text-light">Seçilen zaman aralığında mavi bulut formasyonunda (Squeeze) olan hisse senedi yok.</p>
                            </div>
                        `);
                    } else {
                        data.stocks.forEach(stock => {
                            const card = `
                                <div class="col-md-4 col-lg-3 mb-4">
                                    <div class="stock-card p-4 h-100">
                                        <div class="d-flex justify-content-between align-items-start mb-3">
                                            <div class="stock-symbol">${stock.symbol}</div>
                                            <i class="fas fa-cloud text-info fs-4"></i>
                                        </div>
                                        <div class="mb-3">
                                            <div class="text-muted small text-uppercase letter-spacing-1">Son Fiyat</div>
                                            <div class="stock-price">${stock.price.toFixed(2)} ₺</div>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <span class="squeeze-value" title="Sıkışma Oranı (Ne kadar düşükse o kadar sıkışık)">
                                                <i class="fas fa-compress-alt me-1"></i> %${stock.squeeze.toFixed(1)}
                                            </span>
                                            <a href="https://www.tradingview.com/chart/?symbol=BIST%3A${stock.symbol}" target="_blank" class="btn btn-sm btn-outline-info rounded-pill px-3">
                                                <i class="fas fa-chart-line me-1"></i>Grafik
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            `;
                            stockCards.append(card);
                        });
                    }
                    resultsArea.removeClass('d-none');
                }
            },
            error: function(xhr) {
                let errorMsg = "Tarama sırasında bir hata oluştu.";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                alert(errorMsg);
            },
            complete: function() {
                btn.prop('disabled', false);
                btn.find('.spinner-border').addClass('d-none');
            }
        });
    });

    // PWA Kurulum Butonu Mantığı
    const installBtn = $('#installPwaBtn');
    
    // iOS Kontrolü
    const isIos = () => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(userAgent);
    };
    // standalone özelliği uygulamanın zaten ana ekranda çalışıp çalışmadığını kontrol eder
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIos() && !isStandalone) {
        // iOS için özel buton ve uyarı
        installBtn.removeClass('d-none');
        installBtn.html("<i class='fab fa-apple me-2'></i>iPhone'a Yükle");
        installBtn.click(() => {
            alert("iPhone'a yüklemek için:\n\n1. Safari'nin alt kısmındaki 'Paylaş' (kare ve yukarı ok) ikonuna dokunun.\n2. Açılan menüden 'Ana Ekrana Ekle' (Add to Home Screen) seçeneğini seçip ekleyin.");
        });
    } else {
        // Android ve diğer cihazlar için standart PWA kurulumu
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            // Tarayıcının kendi otomatik kurulum uyarısını engelle
            e.preventDefault();
            deferredPrompt = e;
            
            // Butonu görünür yap
            installBtn.removeClass('d-none');
        });

        installBtn.click(async () => {
            if (deferredPrompt) {
                // Kurulum penceresini göster
                deferredPrompt.prompt();
                
                // Kullanıcının kararını bekle
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    installBtn.addClass('d-none');
                }
                deferredPrompt = null;
            }
        });

        // Zaten kuruluysa butonu gizle
        window.addEventListener('appinstalled', () => {
            installBtn.addClass('d-none');
            deferredPrompt = null;
        });
    }
});
