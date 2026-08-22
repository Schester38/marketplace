jQuery(function($) {
    if (typeof ikeepay_params === 'undefined') {
        return;
    }

    var paymentApproved = false;
    var messageHandler = null;

    function selectedPaymentMethod() {
        return $('input[name="payment_method"]:checked').val();
    }

    function restorePlaceOrderButton(originalText) {
        var $payBtn = $('#place_order');

        if (originalText) {
            $payBtn.html(originalText);
        }

        $payBtn.prop('disabled', false).removeClass('disabled');
    }

    function closeIkeepay(originalText) {
        $('#ikeepay-overlay').hide();
        $('#ikeepay-iframe').attr('src', '');
        restorePlaceOrderButton(originalText);

        if (messageHandler) {
            window.removeEventListener('message', messageHandler);
            messageHandler = null;
        }
    }

    function ensureOverlay(originalText) {
        if ($('#ikeepay-overlay').length) {
            return;
        }

        $('body').append(
            '<div id="ikeepay-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:99999; display:none; align-items:center; justify-content:center;">' +
                '<div class="modal-container" style="position:relative; width:100%; max-width:450px; height:85vh; padding:1rem;">' +
                    '<button id="ikeepay-close-btn" type="button" aria-label="Fermer iKeePay" style="position:absolute; top:-3rem; right:1rem; background:none; border:none; color:white; cursor:pointer;">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                    '<iframe id="ikeepay-iframe" src="" allowtransparency="true" style="border:none; width:100%; height:100%; background:transparent; border-radius:2rem;"></iframe>' +
                '</div>' +
            '</div>'
        );

        $('#ikeepay-close-btn').on('click', function() {
            closeIkeepay(originalText);
        });
    }

    function openIkeepayModal(originalText) {
        var $payBtn = $('#place_order');
        var amount = ikeepay_params.amount;
        var email = $('#billing_email').val() || ikeepay_params.billing_email || '';
        var orderId = 'ORDER_' + Date.now();

        if (!ikeepay_params.public_key) {
            window.alert('La cle publique iKeePay est manquante.');
            restorePlaceOrderButton(originalText);
            return;
        }

        if (!ikeepay_params.secret_key) {
            window.alert('La cle secrete iKeePay est manquante.');
            restorePlaceOrderButton(originalText);
            return;
        }

        ensureOverlay(originalText);

        var params = new URLSearchParams({
            pk: ikeepay_params.public_key,
            sk: ikeepay_params.secret_key,
            amount: amount,
            currency: ikeepay_params.currency,
            order_id: orderId,
            email: email
        });

        messageHandler = function(e) {
            if (e.data && e.data.type === 'ikeepay-error') {
                window.alert(e.data.message || 'Erreur iKeePay.');
                closeIkeepay(originalText);
            }

            if (e.data === 'ikeepay-ready') {
                $('#ikeepay-overlay').css('display', 'flex');
                restorePlaceOrderButton(originalText);
            }

            if (e.data === 'ikeepay-close') {
                closeIkeepay(originalText);
            }

            if (e.data === 'ikeepay-success') {
                paymentApproved = true;
                closeIkeepay(originalText);
                $('form.checkout').find('input[name="ikeepay_modal_approved"]').remove();
                $('form.checkout').append('<input type="hidden" name="ikeepay_modal_approved" value="1">');
                $('form.checkout').trigger('submit');
            }
        };

        window.addEventListener('message', messageHandler);
        $('#ikeepay-iframe').attr('src', ikeepay_params.checkout_url + '?' + params.toString());
        $payBtn.html('Chargement de iKeePay...').prop('disabled', true).addClass('disabled');
    }

    function handleIkeepayCheckout() {
        if (selectedPaymentMethod() !== 'wc_gateway_ikeepay') {
            return true;
        }

        if (paymentApproved) {
            return true;
        }

        openIkeepayModal($('#place_order').html());
        return false;
    }

    function bindCheckoutHandler() {
        var $checkoutForm = $('form.checkout');

        if (!$checkoutForm.length) {
            return;
        }

        $checkoutForm
            .off('checkout_place_order.ikeepay')
            .off('checkout_place_order_wc_gateway_ikeepay.ikeepay')
            .on('checkout_place_order.ikeepay', handleIkeepayCheckout)
            .on('checkout_place_order_wc_gateway_ikeepay.ikeepay', handleIkeepayCheckout);
    }

    bindCheckoutHandler();
    $(document.body).on('updated_checkout', bindCheckoutHandler);
});
