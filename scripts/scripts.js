var map = new BMap.Map("allmap");
makeMap();
function makeMap(){
    map.centerAndZoom(new BMap.Point(103,36),6);
    map.addControl(new BMap.MapTypeControl());  
    map.setCurrentCity("北京");      
    map.enableScrollWheelZoom(true);   

    var opts4 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "文昌航天发射场"  // 信息窗口标题
    }
    var iW4 = new BMap.InfoWindow("坐标: 东经110.95657°    北纬19.63784°", opts4);
    var opts3 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "太原卫星发射中心"  // 信息窗口标题
    }
    var iW3 = new BMap.InfoWindow("坐标: 东经111.60778°    北纬38.84861°", opts3);
    var opts2 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "西昌卫星发射中心"  // 信息窗口标题
    }
    var iW2 = new BMap.InfoWindow("坐标: 东经102.02667°    北纬28.24556°", opts2);
    var opts1 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "酒泉卫星发射中心"  // 信息窗口标题
    }
    var iW1 = new BMap.InfoWindow("坐标: 东经100.27806°    北纬40.96806°", opts1);
    
    drawLaunchsite(100.27806,40.96806,iW1);//酒泉
    drawLaunchsite(102.02667,28.24556,iW2);//西昌
    drawLaunchsite(111.60778,38.84861,iW3);//太原
    drawLaunchsite(110.956571,19.637836,iW4);//文昌
    
    var scaleCtrl = new BMap.ScaleControl();
    map.addControl(scaleCtrl);
    // var zoomCtrl = new BMap.ZoomControl();
    // map.addControl(zoomCtrl); 	
}
function siteInit(){
    var opts4 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "文昌航天发射场"  // 信息窗口标题
    }
    var iW4 = new BMap.InfoWindow("坐标: 东经110.95657°    北纬19.63784°", opts4);
    var opts3 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "太原卫星发射中心"  // 信息窗口标题
    }
    var iW3 = new BMap.InfoWindow("坐标: 东经111.60778°    北纬38.84861°", opts3);
    var opts2 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "西昌卫星发射中心"  // 信息窗口标题
    }
    var iW2 = new BMap.InfoWindow("坐标: 东经102.02667°    北纬28.24556°", opts2);
    var opts1 = {
        width: 100,     // 信息窗口宽度
        height: 70,    // 信息窗口高度
        title: "酒泉卫星发射中心"  // 信息窗口标题
    }
    var iW1 = new BMap.InfoWindow("坐标: 东经100.27806°    北纬40.96806°", opts1);
    
    drawLaunchsite(100.27806,40.96806,iW1);//酒泉
    drawLaunchsite(102.02667,28.24556,iW2);//西昌
    drawLaunchsite(111.60778,38.84861,iW3);//太原
    drawLaunchsite(110.956571,19.637836,iW4);//文昌
}
function drawLaunchsite(siteX,siteY,iW){
    var point=new BMap.Point(siteX,siteY);
    var myIcon = new BMap.Icon("/statics/launch.png",new BMap.Size(33,40),{anchor:new BMap.Size(0,0),imageOffset:new BMap.Size(0, 0)});     
    var marker = new BMap.Marker(point, {icon: myIcon});   
    map.addOverlay(marker); 
    marker.addEventListener("click", 
    function(){          
        map.openInfoWindow(iW, point); //开启信息窗口
    }); 
}
function convertTime(utcTimeStr) {
const regex = /(\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4}) UNTIL (\d{2}) (\w{3}) (\d{2}:\d{2}) (\d{4})/;
const match = utcTimeStr.match(regex);
if (!match) {
    throw new Error("Invalid time format");
}
const [ , startDay, startMonth, startTime, startYear, endDay, endMonth, endTime, endYear ] = match;
const monthMap = {
    JAN: "1", FEB: "2", MAR: "3", APR: "4", MAY: "5", JUN: "6",
    JUL: "7", AUG: "8", SEP: "9", OCT: "10", NOV: "11", DEC: "12"
};
function toLocalTime(day, month, time, year) {
    const utcDate = new Date(`${year}-${monthMap[month]}-${day}T${time}:00Z`);
    const btcDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
    return {
        year: btcDate.getUTCFullYear(),
        month: btcDate.getUTCMonth() + 1,
        day: btcDate.getUTCDate(),
        hours: String(btcDate.getUTCHours()).padStart(2, "0"),
        minutes: String(btcDate.getUTCMinutes()).padStart(2, "0"),
    };
}
const startLocal = toLocalTime(startDay, startMonth, startTime, startYear);
const endLocal = toLocalTime(endDay, endMonth, endTime, endYear);
return `${startLocal.year}年${startLocal.month}月${startLocal.day}日${startLocal.hours}:${startLocal.minutes} 到<br>${endLocal.year}年${endLocal.month}月${endLocal.day}日${endLocal.hours}:${endLocal.minutes} (UTC+8)`;
}
var polygon=[];
var polygonAuto=[];
function drawNot(COORstrin,timee,codee,numm,col,is_self){
    var pos=COORstrin;
    if(!is_self)
        var timestr=convertTime(timee)
    var stPos=0;
    var pointNum=0;
    var arr=[];
    for(var i=0;i<pos.length;i++){
        if(pos[i]=="-"){
            var tmp=pos.substring(stPos,i);
            arr.push(tmp);
            stPos=i+1;
        }
    }
    arr.push(pos.substring(stPos,pos.length));
    var _TheArray=[];
    for(var i=0;i<arr.length;i++){
        _TheArray.push(pullOut(arr[i]));			
    }
    _TheArray.push(_TheArray[0]);
//		_TheArray=[[100,0],[110,0],[100,10],[110,10],[100,0]];
//		alert(_TheArray);
    var apt=[];
    for(var i=0;i<_TheArray.length;i++){
        var pt=new BMap.Point(_TheArray[i][0],_TheArray[i][1]);
        apt.push(pt);
    }
/* 	    	for(var i=0;i< _TheArray.length;i++){
    //	drawLine(_TheArray[i][0],_TheArray[i][1],_TheArray[i+1][0],_TheArray[i+1][1]);
        }*/
    //var col=document.getElementById("color1").value;
    // var colorr=["blue","green"];
    // var col=colorr[Math.floor(Math.random() * colorr.length)]
    var tmpPolygon
    tmpPolygon = new BMap.Polygon(apt,{strokeColor:col, strokeWeight:1,strokeOpacity:1,fillColor:col,fillOpacity:0.3});
    map.addOverlay(tmpPolygon);
    var plo = {
        width: 70,     // 信息窗口宽度
        height: 170,    // 信息窗口高度
        title: "落区航警信息"  // 信息窗口标题
    }
    if(!is_self)
        var pl = new BMap.InfoWindow("持续时间:<br>"+timestr+"<br>航警编号:<br>"+codee, plo);
    else
        var pl = new BMap.InfoWindow("持续时间:<br>"+"null"+"<br>航警编号:<br>"+codee, plo);
    tmpPolygon.addEventListener("click", 
    function(){          
        map.openInfoWindow(pl,new BMap.Point(_TheArray[0][0],_TheArray[0][1])); //开启信息窗口
    });
    if(is_self){
        polygon[numm]=tmpPolygon;
    }
    if(!is_self){
        polygonAuto[numm]=tmpPolygon;
    }
    // window.polygon.push(tmpPolygon);
}

function pullOut(stri){
    var tmpp=[];
    stPos=1;
    var a,b;
    var c,d;
    for(var i=1;i<stri.length;i++){
        if(stri[i]=="E"){
            stPos=i+1;
        }
    }
    a=stri.substring(1,stPos-1);
    b=stri.substring(stPos,stri.length);
    if(a.length==4){
    c=(a-(a%100))/100+(a%100)/60;
    d=(b-(b%100))/100+(b%100)/60;
    }else if(a.length==6){
    c=(a-(a%10000))/10000+((a%10000)-(a%100))/6000+(a%100)/3600;
    d=(b-(b%10000))/10000+((b%10000)-(b%100))/6000+(b%100)/3600;
    }
    tmpp.push(d);
    tmpp.push(c);
    return tmpp;
}   