<?php
/**
 * ئەم فایلە بکە بە config.php و خانەکان پڕ بکەرەوە.
 * config.php لە دەرەوەی public ـە؛ هەرگیز بۆ گشتی مەیخە.
 */
return [
    'app_url' => 'https://giveaway.example.com',
    'app_key' => 'GENERATE_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',
    'db' => [
        'host' => 'localhost',
        'name' => 'cpanel_database_name',
        'user' => 'cpanel_database_user',
        'password' => 'CHANGE_THIS_DATABASE_PASSWORD',
    ],
    'meta' => [
        'app_id' => 'META_APP_ID',
        'app_secret' => 'META_APP_SECRET',
        'allowed_page_id' => 'FACEBOOK_PAGE_ID',
        'redirect_uri' => '', // بەتاڵ بێت: app_url + /api/meta/callback بەکاردێت
        'graph_version' => 'v26.0',
        'webhook_verify_token' => 'GENERATE_A_SEPARATE_RANDOM_WEBHOOK_TOKEN',
    ],
];