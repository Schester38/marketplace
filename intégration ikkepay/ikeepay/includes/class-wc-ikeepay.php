<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WC_Gateway_IKeepay extends WC_Payment_Gateway {

    public function __construct() {
        $this->id                 = 'wc_gateway_ikeepay';
        // Définir le chemin vers l'icône / logo du checkout
        $this->icon = plugins_url( 'assets/images/logo.png', dirname( __FILE__ ) );
        $this->has_fields         = false; // Faux car nous utilisons une modale/iframe externe
        $this->method_title       = __( 'iKeePay', 'woocommerce' );
        $this->method_description = __( 'Permet de recevoir des paiements sécurisés via la modale iKeePay.', 'woocommerce' );

        // Initialiser les champs de configuration
        $this->init_form_fields();
        $this->init_settings();

        // Récupérer les options configurées par le marchand
        $this->title       = $this->get_option( 'title' );
        $this->description = $this->get_option( 'description' );
        $this->public_key  = $this->get_option( 'public_key' );
        $this->secret_key  = $this->get_option( 'secret_key' );

        // Action pour sauvegarder les paramètres dans l'administration de WordPress
        add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
        
        add_action( 'wp_enqueue_scripts', array( $this, 'payment_scripts' ) );
        
        // Hook pour écouter le retour du Webhook (IPN) automatique de iKeePay
        add_action( 'woocommerce_api_' . $this->id, array( $this, 'check_ikeepay_webhook' ) );
    }

    /**
     * Formulaire de configuration dans l'administration WooCommerce
     */
    public function init_form_fields() {
        $this->form_fields = array(
            'enabled' => array(
                'title'   => __( 'Activer/Désactiver', 'woocommerce' ),
                'type'    => 'checkbox',
                'label'   => __( 'Activer iKeePay', 'woocommerce' ),
                'default' => 'no',
            ),
            'title' => array(
                'title'       => __( 'Titre', 'woocommerce' ),
                'type'        => 'text',
                'description' => __( 'Titre que le client voit lors de sa commande.', 'woocommerce' ),
                'default'     => __( 'iKeePay', 'woocommerce' ),
                'desc_tip'    => true,
            ),
            'description' => array(
                'title'       => __( 'Description', 'woocommerce' ),
                'type'        => 'textarea',
                'description' => __( 'Description que le client voit lors de sa commande.', 'woocommerce' ),
                'default'     => __( 'Payez en toute sécurité.', 'woocommerce' ),
            ),
            'public_key' => array(
                'title'       => __( 'Clé Publique (Public Key)', 'woocommerce' ),
                'type'        => 'text',
                'description' => __( 'Entrez votre clé publique iKeePay.', 'woocommerce' ),
            ),
            'secret_key' => array(
                'title'       => __( 'Clé Secrète (Secret Key)', 'woocommerce' ),
                'type'        => 'password',
                'description' => __( 'Entrez votre clé secrète iKeePay. Elle restera masquée pour des raisons de sécurité.', 'woocommerce' ),
            ),
        );
    }

    /**
     * Traitement du paiement au moment du clic sur "Commander"
     */
    public function process_payment( $order_id ) {
        $order = wc_get_order( $order_id );

        // Au lieu de rediriger directement vers une page externe, on va retourner un statut de succès
        // et indiquer à WooCommerce qu'on gère la suite en JavaScript (avec votre modale).
        if ( ! $order ) {
            return array(
                'result' => 'failure',
            );
        }

        if ( empty( $_POST['ikeepay_modal_approved'] ) ) {
            wc_add_notice( __( 'Veuillez valider le paiement iKeePay avant de confirmer la commande.', 'woocommerce' ), 'error' );

            return array(
                'result' => 'failure',
            );
        }

        $order->payment_complete();
        $order->add_order_note( __( 'Paiement iKeePay confirme par la modale checkout.', 'woocommerce' ) );
        WC()->cart->empty_cart();

        return array(
            'result'   => 'success',
            'redirect' => $this->get_return_url( $order ),
        );
    }

    /**
     * Écouteur du Webhook iKeePay
     */
    public function check_ikeepay_webhook() {
        // C'est ici qu'on validera le paiement de serveur à serveur (Étape ultérieure)
        status_header( 200 );
        exit;
    }
    
    /**
     * Charger les scripts JavaScript nécessaires pour la modale
     */
    public function payment_scripts() {
        // Charger le script uniquement sur la page de paiement/commande
        if ( ! is_checkout() && ! is_checkout_pay_page() && ! is_add_payment_method_page() ) {
            return;
        }

        // Si la passerelle n'est pas activée, on ne charge pas le JS
        if ( 'no' === $this->enabled ) {
            return;
        }

        $js_url = plugins_url( '../assets/js/ikeepay-checkout.js', __FILE__ );

        wp_enqueue_script( 'wc_ikeepay_checkout', $js_url, array( 'jquery', 'wc-checkout' ), '1.0.3', true );
        // Récupérer les détails de la commande en cours (si applicable)
        $amount = 0;
        $order_id = 0;
        $email = '';
        $return_url = '';

        if ( is_checkout() ) {
            // Dans le cadre d'un checkout standard, on passe des valeurs temporaires ou globales
            // car la commande n'est créée en base qu'au clic.
            $amount = WC()->cart->get_total( 'edit' );
            $email = WC()->customer->get_billing_email();
        }

        // Transmettre les données PHP vers le JavaScript (sécurisé)
        wp_localize_script( 'wc_ikeepay_checkout', 'ikeepay_params', array(
            'public_key'   => $this->public_key,
            'secret_key'   => $this->secret_key,
            'checkout_url' => 'https://ikeepay.com/checkout/v1/inline',
            'amount'       => $amount,
            'currency'     => get_woocommerce_currency(),
            'order_id'     => 'ORDER_' . time(), // Identifiant temporaire ou basé sur la session
            'billing_email'=> $email,
            'return_url'   => wc_get_checkout_url(),
        ));
    }
    
    
}
