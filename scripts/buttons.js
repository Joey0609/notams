const hideButton = document.getElementById('hideButton');
const expandableArea = document.getElementById('expandableArea');
const customButton = document.getElementById('customButton');
let isExpanded = false;
hideButton.addEventListener('click', () => {
    const confirmationDialog = document.createElement('div');
    confirmationDialog.style.position = 'fixed';
    confirmationDialog.style.top = '50%';
    confirmationDialog.style.left = '50%';
    confirmationDialog.style.transform = 'translate(-50%, -50%)';
    confirmationDialog.style.backgroundColor = '#fff';
    confirmationDialog.style.padding = '20px';
    confirmationDialog.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    confirmationDialog.style.zIndex = '1000';
    confirmationDialog.style.textAlign = 'center';

    const message = document.createElement('p');
    message.textContent = "All controls will be hidden. To show them again, refresh the page or press F12 to open the console and call showAll()";
    confirmationDialog.appendChild(message);

    const image = document.createElement('img');
    image.src = '/assets/showAllHelp.png';
    image.alt = 'Help Image';
    image.style.maxWidth = '100%';
    image.style.marginTop = '10px';
    confirmationDialog.appendChild(image);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '20px';

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirm';
    confirmButton.style.marginRight = '10px';
    confirmButton.addEventListener('click', () => {
        document.body.removeChild(confirmationDialog);
        // Proceed with hiding controls
        const controls = document.getElementById('controls');
        const autoListBtn = document.getElementById('autoListBtn');
        const hideButton = document.getElementById('hideButton');
        const customButton = document.getElementById('customButton');
        if (controls) {
            controls.style.display = 'none';
        }
        if (autoListBtn) {
            autoListBtn.style.display = 'none';
        }
        if (hideButton) {
            hideButton.style.display = 'none';
        }
        if (customButton) {
            customButton.style.display = 'none';
        }
        const fourthChild = document.querySelector('#allmap > div:nth-child(4)');
        if (fourthChild) {
            fourthChild.style.display = 'none';
        }
        const mapScaleControl = document.querySelector('#allmap > div.BMap_scaleCtrl.BMap_noprint.anchorBL');
        if (mapScaleControl) {
            mapScaleControl.style.display = 'none';
        }
        const mapCopyrightControl = document.querySelector('#allmap > div.BMap_cpyCtrl.BMap_noprint.anchorBL');
        if (mapCopyrightControl) {
            mapCopyrightControl.style.display = 'none';
        }
        const mapControl = document.querySelector('#allmap > div.BMap_noprint.anchorTR');
        if (mapControl) {
            mapControl.style.display = 'none';
        }
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
        document.body.removeChild(confirmationDialog);
    });

    buttonContainer.appendChild(confirmButton);
    buttonContainer.appendChild(cancelButton);
    confirmationDialog.appendChild(buttonContainer);

    document.body.appendChild(confirmationDialog);


    
});
 function showAll()
{
    const controls = document.getElementById('controls');
    const autoListBtn = document.getElementById('autoListBtn');
    const hideButton = document.getElementById('hideButton');
    const customButton = document.getElementById('customButton');
    if (controls) {
        controls.style.display = 'flex';
    }
    if (autoListBtn) {
        autoListBtn.style.display = 'flex';
    }
    if (hideButton) {
        hideButton.style.display = 'flex';
    }
    if (customButton) {
        customButton.style.display = 'flex';
    }
}
