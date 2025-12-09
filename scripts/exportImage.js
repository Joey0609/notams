// 检测是否在 PyWebView 环境中
const isPyWebView = typeof window.pywebview !== 'undefined';

// 初始化时显示/隐藏 PyWebView 相关提示
if (isPyWebView) {
  const pywebviewSaveHint = document.getElementById('pywebviewSaveHint');
  if (pywebviewSaveHint) {
    pywebviewSaveHint.style.display = 'block';
  }
}

// 主导出函数 (使用 leaflet-image)
async function exportMapAsImage() {
  const exportBtn = document.getElementById('btnExportImage');
  const originalText = exportBtn.innerHTML;
  const originalBg = exportBtn.style.background; // 保存原始背景
  exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 导出中... 0%';
  exportBtn.disabled = true;
  exportBtn.style.background = 'linear-gradient(to right, #2980b9 0%, #e0e0e0 0%)'; // 初始化进度条

  try {
    const range = document.getElementById('exportRange').value;
    const format = document.getElementById('exportFormat').value;

    // 如果选择 "full" 且有可见的落区，先调整视图
    if (range === 'full') {
      // 收集所有可见的多边形（手动+自动）
      const visiblePolygons = [];

      // 1. 处理可见的手动航警
      const visibleManualPolygons = manualNotams
        .filter(notam => manualVisibleState[notam.id] !== false && notam.polygon)
        .map(notam => notam.polygon);
      visiblePolygons.push(...visibleManualPolygons);

      // 2. 处理可见的自动航警 - 新增部分
      const visibleAutoPolygons = polygonAuto
        .filter((poly, idx) => visibleState[idx] !== false && poly);
      visiblePolygons.push(...visibleAutoPolygons);

      if (visiblePolygons.length > 0) {
        // 创建临时图层组计算边界
        const tempGroup = L.featureGroup(visiblePolygons);
        const bounds = tempGroup.getBounds();
        map.fitBounds(bounds, { padding: [10, 10] });
        // 等待地图完成调整
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      // 否则使用当前视图
    }

    // 使用 leaflet-image 获取 canvas，并传入进度回调
    leafletImage(map, async (err, canvas) => {

      // 恢复按钮
      exportBtn.innerHTML = originalText;
      exportBtn.disabled = false;
      exportBtn.style.background = originalBg; // 恢复原始背景

      if (err) {
        console.error('导出失败:', err);
        alert('导出失败：' + (err.message || '未知错误'));
        return;
      }

      if (isPyWebView) {
        // =============== PyWebView 环境 ===============
        try {
          const dataURL = canvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.92 : 1.0);
          const dateStr = new Date().toISOString().replace(/T.*/, '').replace(/-/g, '');
          const defaultName = `NOTAM_落区_${dateStr}.${format}`;

          // 调用 PyWebView API 保存文件
          try {
            const response = await fetch('/save_image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ default_name: defaultName, data_url: dataURL })
            });
            const result = await response.json();

            if (result.success) {
              showNotification(`已保存至：${result.filePath}`, 'success');
            } else if (result.message) {
              showNotification(result.message, 'info');
            } else {
              throw new Error(result.error || '保存失败');
            }
          } catch (e) {
            console.error('保存失败:', e);
            // Fallback: 浏览器直接下载
            const link = document.createElement('a');
            link.download = defaultName;
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showNotification('保存失败，已直接下载到浏览器', 'warning');
          }

          // if (result.success) {
          //   showNotification(`已保存至：${result.filePath}`, 'success');
          // } else {
          //   showNotification('用户取消保存', 'info');
          // }
        } catch (e) {
          console.error('PyWebView 保存失败:', e);
          alert('保存失败: ' + (e.message || '未知错误'));
        }
      } else {
        // =============== 浏览器环境 ===============
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().replace(/T.*/, '').replace(/-/g, '');
        link.download = `NOTAM_落区_${dateStr}.${format}`;
        link.href = canvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.92 : 1.0);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('导出成功！', 'success');
      }
    }, (progress) => {
      // 更新按钮进度条
      exportBtn.style.background = `linear-gradient(to right, #2980b9 ${progress}%, #7eb6db ${progress}%)`;
      exportBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 导出中... ${progress}%`;
    });
  } catch (error) {
    console.error('导出过程出错:', error);
    alert('导出过程中发生错误: ' + error.message);
    exportBtn.innerHTML = originalText;
    exportBtn.disabled = false;
    exportBtn.style.background = originalBg; // 恢复
  }
}

// 绑定导出按钮
document.getElementById('btnExportImage')?.addEventListener('click', exportMapAsImage);

// 初始化：确保 leaflet-image 已加载
if (typeof leafletImage === 'undefined') {
  console.error('leaflet-image 未加载，请确保已引入相关库');
  document.getElementById('btnExportImage').disabled = true;
}