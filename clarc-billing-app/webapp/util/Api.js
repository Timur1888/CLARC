sap.ui.define([], function () {
    "use strict";

    return {
        apiUrl: function (path) {
            return sap.ui.require.toUrl("clarc/billing/clarcbillingapp") + path;
        }
    };
});