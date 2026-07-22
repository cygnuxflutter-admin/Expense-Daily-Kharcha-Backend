const db = require('../config/db');

// Get Ads Status and Configuration
exports.getAdsStatus = async (req, res) => {
  try {
    const result = await db.query("SELECT key_name, value FROM app_config WHERE key_name IN ('is_show_ads', 'ads_config_json')");

    let isShowAds = true;
    let config = {
      for_android: {
        open_app_ads: "",
        native_app_ads: "",
        banner_app_ads: "",
        intertitial_app_ads: ""
      },
      for_ios: {
        open_app_ads: "",
        native_app_ads: "",
        banner_app_ads: "",
        intertitial_app_ads: ""
      }
    };

    result.rows.forEach(row => {
      if (row.key_name === 'is_show_ads') {
        isShowAds = (row.value === 'true' || row.value === true);
      } else if (row.key_name === 'ads_config_json') {
        try {
          config = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        } catch (e) {
          console.error("Error parsing ads_config_json", e);
        }
      }
    });

    return res.status(200).json({
      success: true,
      isShowAds: isShowAds,
      ...config
    });
  } catch (error) {
    console.error('[getAdsStatus] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update Ads Status and AdMob IDs (Admin logic)
exports.updateAdsStatus = async (req, res) => {
  const { isShowAds, for_android, for_ios } = req.body;

  if (isShowAds === undefined) {
    return res.status(400).json({ success: false, message: 'isShowAds field is required' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Update visibility status
    await client.query(
      `INSERT INTO app_config (key_name, value)
       VALUES ('is_show_ads', $1)
       ON CONFLICT (key_name) DO UPDATE SET value = $1`,
      [isShowAds]
    );

    // Update AdMob IDs JSON
    const configJson = JSON.stringify({ for_android, for_ios });
    await client.query(
      `INSERT INTO app_config (key_name, value)
       VALUES ('ads_config_json', $1)
       ON CONFLICT (key_name) DO UPDATE SET value = $1`,
      [configJson]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Ads configuration updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[updateAdsStatus] ERROR:', error.message);
    return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  } finally {
    client.release();
  }
};
