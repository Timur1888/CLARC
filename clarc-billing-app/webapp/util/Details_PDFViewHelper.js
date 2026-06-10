sap.ui.define([
  "sap/ui/core/UIComponent",
  "clarc/billing/clarcbillingapp/util/Api"
], function (UIComponent, Api) {
  "use strict";

  return {
    getBundle: function (oController) {
      return oController.getOwnerComponent().getModel("i18n").getResourceBundle();
    },
    // =====================================F=====================
    // PDF: Source vorbereiten (URL oder Base64 -> ObjectURL)
    // ==========================================================
    preparePdfSourceFromInvoice: async function (oController, oInvoice) {
      const oBundle = this.getBundle(oController);
      const oModel = oController.getOwnerComponent().getModel("backend");
      if (!oModel) return;

      const aBlobs = oInvoice?.MetaData?.Blobs || [];

      const isPdf = (b) =>
        b?.MimeType === "application/pdf" || ((b?.FileName || "").toLowerCase().endsWith(".pdf"));

      const isImg = (b) => {
        const fn = (b?.FileName || "").toLowerCase();
        return (b?.MimeType || "").startsWith("image/") ||
          fn.endsWith(".png") || fn.endsWith(".jpg") || fn.endsWith(".jpeg");
      };

      const aItems = [];

      // ✅ filter vorher, dann async-fähig iterieren
      const aRelevant = aBlobs.filter(b => isPdf(b) || isImg(b));

      for (const b of aRelevant) {
        const bIsPdf = isPdf(b);
        const sFileName = b.FileName || b.Name || (bIsPdf ? "PDF" : "Image");
        const sLink = b.Link || "";

        if (bIsPdf) {
          const aViewBlobs = Array.isArray(b?.ViewBlobs) ? b.ViewBlobs : [];

          if (aViewBlobs.length > 0) {
            aViewBlobs.forEach((vb, idx) => {
              aItems.push({
                sortId: b.SortId,
                id: `${b.Id || sFileName}__p${idx + 1}`,
                fileName: `${sFileName} (p.${idx + 1})`,
                mimeType: b.MimeType || "",
                fileLink: sLink,
                previewLink: vb?.Link || "",
                kind: "pdf",
                icon: "sap-icon://pdf-attachment",
                openText: "Open PDF",
                pageIndex: idx + 1
              });
            });
          } else {
            const sDocId = oModel.getProperty("/CurrentInvoice/Id");
            //test
            const sUrl = `/application/api/v1/documenthub/document(${encodeURIComponent(sDocId)})/generateviewblobs`;

            const oResp = await fetch(Api.apiUrl(sUrl), {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                Limit: 0
              })
            });

            const sText = await oResp.text();
            if (!oResp.ok) {
              sap.m.MessageBox.error(oBundle.getText("UploadError") + ` (${oResp.status}): ${sText}`);
              return;
            }
            const oJson = JSON.parse(sText);

            const aViewBlobs = (oJson?.Blobs?.[0]?.ViewBlobs) || [];

            aViewBlobs.forEach((vb, idx) => {
              aItems.push({
                sortId: b.SortId,
                id: `${b.Id || sFileName}__p${idx + 1}`,
                fileName: `${sFileName} (p.${idx + 1})`,
                mimeType: b.MimeType || "",
                fileLink: sLink,
                previewLink: vb?.Link || "",
                kind: "pdf",
                icon: "sap-icon://pdf-attachment",
                openText: oBundle.getText("OpenPDF"),
                pageIndex: idx + 1
              });
            });
          }

          continue;
        }

        // Image bleibt 1:1
        aItems.push({
          sortId: b.SortId,
          id: b.Id,
          fileName: sFileName,
          mimeType: b.MimeType || "",
          fileLink: sLink,
          previewLink: sLink,
          kind: "image",
          icon: "sap-icon://attachment-photo",
          openText: oBundle.getText("OpenImg")
        });
      }

      oModel.setProperty("/CurrentInvoice/BlobItems", aItems);

      // Selektion beibehalten (wie bei dir)
      const iOldIndex = oModel.getProperty("/CurrentInvoice/SelectedBlobIndex");
      const sOldId = (Number.isInteger(iOldIndex) && aItems[iOldIndex]) ? aItems[iOldIndex].id : null;

      let iNewIndex = 0;
      if (sOldId) {
        const idx = aItems.findIndex(x => x.id === sOldId);
        if (idx >= 0) iNewIndex = idx;
      } else if (Number.isInteger(iOldIndex) && iOldIndex >= 0 && iOldIndex < aItems.length) {
        iNewIndex = iOldIndex;
      }

      oModel.setProperty("/CurrentInvoice/SelectedBlobIndex", iNewIndex);

      const oSel = aItems[iNewIndex] || null;

      oModel.setProperty("/CurrentInvoice/SelectedFileKind", oSel?.kind || "");
      oModel.setProperty("/CurrentInvoice/SelectedFileSource", oSel?.fileLink || "");
      oModel.setProperty("/CurrentInvoice/PdfSource", oSel?.kind === "pdf" ? (oSel?.fileLink || "") : "");
    },




    // PDF: Popup öffnen (wie UI5 Sample)
    onPdfPress: function (oController) {
      const oBundle = this.getBundle(oController);
      const oModel = oController.getOwnerComponent().getModel("backend");
      const sSource = oModel.getProperty("/CurrentInvoice/PdfSource");

      if (!sSource) {
        console.warn(oBundle.getText("NoPDFSource"));
        return;
      }

      // Controller besitzt den Viewer (wird in onInit erzeugt)
      oController._oPdfViewer.setSource(sSource);
      oController._oPdfViewer.setTitle("Invoice PDF");
      oController._oPdfViewer.open();
    },

    onFilePress: function (oController) {
      const oBundle = this.getBundle(oController);
      const oModel = oController.getOwnerComponent().getModel("backend");
      const sKind = oModel.getProperty("/CurrentInvoice/SelectedFileKind");
      const sSource = oModel.getProperty("/CurrentInvoice/SelectedFileSource");

      if (!sSource) {
        console.warn(oBundle.getText("NoSource"));
        return;
      }

      if (sKind === "pdf") {
        // wie bisher
        oController._oPdfViewer.setSource(sSource);
        oController._oPdfViewer.setTitle("Invoice PDF");
        oController._oPdfViewer.open();
        return;
      }

      if (sKind === "image") {
        if (!oController._iImageZoom) {
          oController._iImageZoom = 1;
        }

        if (!oController._oImageDialog) {
          const oImage = new sap.m.Image({
            densityAware: false,
            width: "100%",
            height: "100%"
          }).addStyleClass("previewZoomImage");

          const oImageWrapper = new sap.m.VBox({
            width: "100%",
            height: "100%",
            alignItems: "Center",
            justifyContent: "Center",
            items: [oImage]
          }).addStyleClass("previewImageWrapper");

          const oScroll = new sap.m.ScrollContainer({
            width: "100%",
            height: "100%",
            horizontal: true,
            vertical: true,
            content: [oImageWrapper]
          });

          oController._oImageDialog = new sap.m.Dialog({
            title: "Image",
            stretch: true,
            contentWidth: "100%",
            contentHeight: "100%",
            content: [oScroll],
            buttons: [
              new sap.m.Button({
                text: "-",
                press: function () {
                  oController._iImageZoom = Math.max(0.2, oController._iImageZoom - 0.1);
                  this._applyImageZoom(oController);
                }.bind(this)
              }),
              new sap.m.Button({
                text: "+",
                press: function () {
                  oController._iImageZoom = Math.min(5, oController._iImageZoom + 0.1);
                  this._applyImageZoom(oController);
                }.bind(this)
              }),
              new sap.m.Button({
                text: "Download",
                icon: "sap-icon://download",
                press: function () {
                  const a = document.createElement("a");
                  a.href = oController._sCurrentImageSource;
                  a.download = oController._sCurrentImageName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }
              }),
              new sap.m.Button({
                text: "Close",
                press: function () {
                  oController._oImageDialog.close();
                }
              })
            ]
          });

          oController.getView().addDependent(oController._oImageDialog);
        }

        oController._iImageZoom = 1;

        const oScroll = oController._oImageDialog.getContent()[0];
        const oWrapper = oScroll.getContent()[0];
        const oImg = oWrapper.getItems()[0];

        oController._sCurrentImageSource = sSource;
        oController._sCurrentImageName =
          oModel.getProperty("/CurrentInvoice/SelectedFileName") || "image";
        oImg.setSrc(sSource);

        oController._oImageDialog.open();

        setTimeout(function () {
          this._applyImageZoom(oController);
        }.bind(this), 0);

        return;
      }

      // Fallback: unbekannt -> nur neues Tab öffnen
      window.open(sSource, "_blank");
    },

    _applyImageZoom: function (oController) {
      const oScroll = oController._oImageDialog.getContent()[0];
      const oWrapper = oScroll.getContent()[0];
      const oImg = oWrapper.getItems()[0];
      const oDom = oImg.getDomRef();

      if (!oDom) {
        return;
      }

      oDom.style.transform = "scale(" + oController._iImageZoom + ")";
      oDom.style.transformOrigin = "center center";
    },


    onBlobPageChanged: function (oController, oEvent) {
      const iIndex = oEvent.getParameter("activePages")[0];
      const oModel = oController.getOwnerComponent().getModel("backend");

      const aItems = oModel.getProperty("/CurrentInvoice/BlobItems") || [];
      const oItem = aItems[iIndex];

      oModel.setProperty("/CurrentInvoice/SelectedBlobIndex", iIndex);
      oModel.setProperty("/CurrentInvoice/SelectedFileKind", oItem?.kind || "");
      oModel.setProperty("/CurrentInvoice/SelectedFileSource", oItem?.fileLink || "");

      // Keep backward compatibility (falls noch irgendwo PdfSource genutzt wird)
      oModel.setProperty("/CurrentInvoice/PdfSource", oItem?.kind === "pdf" ? (oItem?.fileLink || "") : "");
    },

    onClose: function (oController, onSave) {
      const oBundle = this.getBundle(oController);
      if (onSave === true) {

        sap.m.MessageBox.confirm(
          oBundle.getText("ExitWarrning"),
          {
            title: "Confirm",
            actions: ["Okay", "Cancel"],
            onClose: function (sAction) {

              if (sAction === "Okay") {

                const oRouter = sap.ui.core.UIComponent.getRouterFor(oController);
                oRouter.navTo("RouteView1", {}, true);

                const oMainViewModel = oController.getView().getModel("mainView");
                if (oMainViewModel) {
                  oMainViewModel.setProperty("/layout", "OneColumn");
                }

              }
            }
          }
        );

        return; // verhindert dass Code sofort weiterläuft
      }

      const oRouter = sap.ui.core.UIComponent.getRouterFor(oController);
      oRouter.navTo("RouteView1", {}, true);

      const oMainViewModel = oController.getView().getModel("mainView");
      if (oMainViewModel) {
        oMainViewModel.setProperty("/layout", "OneColumn");
      }
    }
  };
});
