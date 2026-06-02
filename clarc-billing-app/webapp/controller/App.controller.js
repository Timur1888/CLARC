sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
  "use strict";

  return BaseController.extend("clarc.billing.clarcbillingapp.controller.App", {
    onInit() {
      const bInLaunchpad = !!(sap.ushell && sap.ushell.Container);

      const oViewModel = new JSONModel({
        layout: "OneColumn",
        openDetailsOnMatch: false,
        showStandaloneShell: !bInLaunchpad
      });

      this.getView().setModel(oViewModel, "mainView");
    }
  });
});