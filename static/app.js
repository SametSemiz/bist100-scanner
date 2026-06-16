$(document).ready(function() {
    $('#scanBtn').click(function() {
        const btn = $(this);
        const spinner = $('#runSpinner');
        const resultsArea = $('#resultsArea');
        const stockCards = $('#stockCards');
        const scanStats = $('#scanStats');
        const timeframe = $('input[name="timeframe"]:checked').val();

        // UI Durumunu Güncelle
        btn.prop('disabled', true);
        btn.find('.spinner-border').removeClass('d-none');
        resultsArea.addClass('d-none');
        stockCards.empty();

        $.ajax({
            url: '/scan',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ timeframe: timeframe }),
            success: function(response) {
                if (response.status === 'success') {
                    const data = response.data;
                    scanStats.text(`${data.count} / ${data.total_scanned} Hisse Mavi Bulutta`);
                    
                    if (data.count === 0) {
                        stockCards.html(`
                            <div class="col-12 text-center py-5">
                                <i class="fas fa-search-minus fa-3x text-muted mb-3"></i>
                                <h4 class="text-light">Eşleşen Hisse Bulunamadı</h4>
                                <p class="text-muted">Seçilen zaman aralığında mavi bulut formasyonunda (Squeeze) olan hisse senedi yok.</p>
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
});
