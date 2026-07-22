sap.ui.define([
    "sap/m/Image",
    "sap/m/VBox",
    "sap/m/ScrollContainer",
    "sap/m/Dialog",
    "sap/m/Button"
], function (Image, VBox, ScrollContainer, Dialog, Button) {
    "use strict";

    return {
        getBundle: function (oController) {
            return oController.getOwnerComponent().getModel("i18n").getResourceBundle();
        },
        ensureImageDialog: function (oController) {
            if (oController._oImageDialog && oController._oImagePreview) {
                return;
            }

            const oImage = new Image({
                densityAware: false,
                width: "100%",
                height: "100%"
            }).addStyleClass("previewZoomImage");

            oController._oImagePreview = oImage;

            const oWrapper = new VBox({
                width: "100%",
                height: "100%",
                alignItems: "Center",
                justifyContent: "Center",
                items: [oImage]
            }).addStyleClass("previewImageWrapper");

            const oScroll = new ScrollContainer({
                width: "100%",
                height: "100%",
                horizontal: true,
                vertical: true,
                content: [oWrapper]
            });
            const oBundle = this.getBundle(oController);
            oController._oImageDialog = new Dialog({
                title: "Image",
                stretch: true,
                contentWidth: "100%",
                contentHeight: "100%",
                content: [oScroll],
                buttons: [
                    new Button({
                        icon: "sap-icon://zoom-out",
                        press: function () {
                            oController._iImageZoom = Math.max(0.2, oController._iImageZoom - 0.1);
                            this.applyImageZoom(oController);
                        }.bind(this)
                    }),
                    new Button({
                        icon: "sap-icon://zoom-in",
                        press: function () {
                            oController._iImageZoom = Math.min(5, oController._iImageZoom + 0.1);
                            this.applyImageZoom(oController);
                        }.bind(this)
                    }),
                    new Button({
                        text: oBundle.getText("ImgDownload"),
                        icon: "sap-icon://download",
                        press: async function () {
                            const oResponse = await fetch(oController._sCurrentImageSource);
                            const oBlob = await oResponse.blob();
                            const sBlobUrl = URL.createObjectURL(oBlob);

                            const a = document.createElement("a");
                            a.href = sBlobUrl;
                            a.download = oController._sCurrentImageName || "image.jpg";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);

                            setTimeout(() => URL.revokeObjectURL(sBlobUrl), 1000);
                        }
                    }),
                    new Button({
                        text: oBundle.getText("ImgClose"),
                        press: function () {
                            oController._oImageDialog.close();
                        }
                    })
                ]
            });

            oController.getView().addDependent(oController._oImageDialog);
        },

        openImageDialog: function (oController, sUrl, sName) {
            this.ensureImageDialog(oController);

            oController._iImageZoom = 1;
            oController._sCurrentImageSource = sUrl;
            oController._sCurrentImageName = sName || "image.jpg";

            oController._oImageDialog.setTitle(sName || "Image");
            oController._oImagePreview.setSrc(sUrl);
            oController._oImageDialog.open();

            setTimeout(function () {
                this.applyImageZoom(oController);
            }.bind(this), 0);
        },

        applyImageZoom: function (oController) {
            const oImg = oController._oImagePreview;
            const oDom = oImg && oImg.getDomRef();

            if (!oDom) {
                return;
            }

            oDom.style.transform = "scale(" + oController._iImageZoom + ")";
            oDom.style.transformOrigin = "center center";
        }
    };
});