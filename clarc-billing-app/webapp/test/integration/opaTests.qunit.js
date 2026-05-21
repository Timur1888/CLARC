/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["clarc/billing/clarcbillingapp/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
