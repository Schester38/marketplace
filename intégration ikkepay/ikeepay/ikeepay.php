<?php
/**
 * Plugin Name: iKeePay Checkout Gateway
 * Description: Intégration officielle de la modale iKeePay pour WooCommerce.
 * Version:     1.0.0
 * Author:      iKeePay Team
 * License:     GPL2
 */

// Sécurité : Empêcher l'accès direct
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// On attend que tous les plugins soient chargés
add_action( 'plugins_loaded', 'ikeepay_gateway_init' );

function ikeepay_gateway_init() {
    // Si WooCommerce n'est pas installé ou activé, on arrête tout
    if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
        return;
    }

    // On inclut le fichier qui contiendra la logique WooCommerce (Étape suivante)
    require_once plugin_dir_path( __FILE__ ) . 'includes/class-wc-ikeepay.php';

    // On enregistre la passerelle iKeePay dans WooCommerce
    add_filter( 'woocommerce_payment_gateways', 'ikeepay_add_to_gateways' );
}

function ikeepay_add_to_gateways( $gateways ) {
    $gateways[] = 'WC_Gateway_IKeepay'; // Nom de la classe PHP qu'on va créer
    return $gateways;
}