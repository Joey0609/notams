const helpButton = document.getElementById('helpButton');
const expandableArea = document.getElementById('expandableArea');
const customButton = document.getElementById('customButton');
let isExpanded = false;
helpButton.addEventListener('click', () => {
    isExpanded = !isExpanded;

    if (isExpanded) {
        expandableArea.style.height = '180px';
        expandableArea.style.bottom = '10px';
        helpButton.style.transform = 'translateY(-180px)';
        customButton.style.transform = 'translateY(-180px)';
        helpButton.textContent = '收起';
    } else {
        expandableArea.style.height = '0';
        expandableArea.style.bottom = '0';
        helpButton.style.transform = 'translateY(0)';
        customButton.style.transform = 'translateY(0)';
        helpButton.textContent = '帮助';
    }
});
