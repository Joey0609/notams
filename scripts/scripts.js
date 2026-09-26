var map = null;
var mapViewMode = '2d';


var highlightPolygon = null;
var autoListExpanded = false;
var polygon = [];
var polygonAuto = [];
var launchSiteMarkers = [];
var allLaunchSiteGroups = [];
// 境外工位数据入口：每项需提供 { name, lat, lng, siteName, content }；必须是工位坐标，不能用发射场中心代替。
// 资料按 2026-09 可查公开信息整理；LC-39A-Starship 是 39A 范围内的开发区域标注，不代表独立发射台编号。
var launchPadData = [
    {
        name: 'LC-36A', lat: 28.471832, lng: -80.538168, siteName: 'Cape Canaveral SFS / Blue Origin',
        content: 'Blue Origin 的 New Glenn 发射台。2026 年 5 月地面热试验发生重大异常；场地清理已完成，主要修复仍在进行，公司目标为 2026 年内恢复飞行。<br><a href="https://www.blueorigin.com/news/new-glenn-return-to-flight" target="_blank" rel="noopener">Blue Origin：恢复飞行与修复进度</a>'
    },
    {
        name: 'LC-36B（LC-11）', lat: 28.475534, lng: -80.538567, siteName: 'Cape Canaveral SFS / Blue Origin',
        content: 'Blue Origin 于 2026 年 8 月启动 LC-36B 建设，计划支持更大型的 New Glenn 9x4。LC-36B 与历史 LC-11 是不同编号，不应视为同一发射台。<br><a href="https://www.blueorigin.com/news/returning-launch-complex-36-to-two-pads" target="_blank" rel="noopener">Blue Origin：LC-36B 建设</a>'
    },
    {
        name: 'SLC-46', lat: 28.458493, lng: -80.528412, siteName: 'Cape Canaveral Spaceport / Space Florida',
        content: 'Space Florida 管理的多用途发射场，可支持商业与政府任务。FAA 列示的发射场许可证有效至 2030 年；公开资料中可确认的较近发射包括 2017 年 ORS-5，2019 年执行 NASA Orion 中止逃逸测试。<br><a href="https://www.faa.gov/space/spaceports_by_state" target="_blank" rel="noopener">FAA：佛罗里达发射场资料</a>'
    },
    {
        name: 'LC-12', lat: 28.480652, lng: -80.541971, siteName: 'Cape Canaveral SFS',
        content: '历史 Atlas 火箭发射场，现已不是现役发射台。场区保留历史遗址/设施；公开资料显示 Blue Origin 曾租用该区域作相关用途，但当前具体使用情况未能从近期官方资料确认。<br><a href="https://ccspacemuseum.org/facilities/launch-complex-12/" target="_blank" rel="noopener">卡纳维拉尔角太空军博物馆：LC-12</a>'
    },
    {
        name: 'LC-14', lat: 28.491131, lng: -80.546895, siteName: 'Cape Canaveral SFS / Stoke Space',
        content: 'Stoke Space 的 Nova 发射场。Stoke 于 2026 年 2 月举行场地启用仪式，并于 9 月公布 Nova Pathfinder 首飞任务客户；首飞目标为 2027 年初，目前处于建设和任务准备阶段。<br><a href="https://www.stokespace.com/news/Manifest-Update-Nova-Pathfinder-Flight-1" target="_blank" rel="noopener">Stoke：Nova Pathfinder 首飞更新</a>'
    },
    {
        name: 'LC-16', lat: 28.502078, lng: -80.551350, siteName: 'Cape Canaveral SFS / Relativity Space',
        content: 'Relativity Space 的 Terran R 发射场。2026 年 7 月更新显示，水平总装设施、供电、运输起竖设备及发射支持系统仍在建设和安装；尚未进入 Terran R 运营发射阶段。<br><a href="https://www.relativityspace.com/press-release/2026/8/11/july-2026-company-update" target="_blank" rel="noopener">Relativity：2026 年 7 月进展</a>'
    },
    {
        name: 'SLC-20', lat: 28.512194, lng: -80.556701, siteName: 'Cape Canaveral SFS / Space Florida',
        content: 'Space Florida 改造的发射设施。Firefly 将其列为预留发射能力；目前未查到该公司已从 SLC-20 发射的公开记录，适合标注为可用/预留，而非正在常态发射。<br><a href="https://www.spaceflorida.gov/facilities/launch-complex-20" target="_blank" rel="noopener">Space Florida：SLC-20</a> · <a href="https://investors.fireflyspace.com/static-files/574d6243-0208-4f82-bbd9-42e4f494eefa" target="_blank" rel="noopener">Firefly：发射场状态</a>'
    },
    {
        name: 'SLC-37A', lat: 28.534748, lng: -80.567502, siteName: 'Cape Canaveral SFS / SLC-37 改造区',
        content: 'SLC-37 场区的一部分。该区域正处于退役设施清理及未来用途改造阶段；SpaceX Starship/Super Heavy 方案曾进入美国太空军环境评估，公开文件中的方案/审批条件不能等同于已具备发射能力。<br><a href="https://www.patrick.spaceforce.mil/Portals/14/documents/Enviromental%20Documents/Draft-SpaceX-Starship-Super-Heavy-CCSFS-Environmental-Impact-Statement.pdf?ver=rKQDMpws9EkIc4HABjGAJA%3D%3D" target="_blank" rel="noopener">美国太空军：SLC-37 环评文件</a>'
    },
    {
        name: 'SLC-37B', lat: 28.531437, lng: -80.564259, siteName: 'Cape Canaveral SFS / SLC-37 改造区',
        content: '曾用于 ULA Delta IV Heavy；最后一次发射于 2024 年 4 月完成。之后进入设施清理和改造阶段，SpaceX Starship/Super Heavy 是公开环境评估中的拟议用途，不能据此认定已投入发射。<br><a href="https://www.patrick.spaceforce.mil/Portals/14/documents/Enviromental%20Documents/Draft-SpaceX-Starship-Super-Heavy-CCSFS-Environmental-Impact-Statement.pdf?ver=rKQDMpws9EkIc4HABjGAJA%3D%3D" target="_blank" rel="noopener">美国太空军：SLC-37 环评文件</a>'
    },
    {
        name: 'SLC-40', lat: 28.561951, lng: -80.577177, siteName: 'Cape Canaveral SFS / SpaceX',
        content: 'SpaceX Falcon 9 现役发射场，已支持载人 Dragon 任务。NASA 记录显示，Crew-12 于 2026 年 2 月从此处发射。<br><a href="https://www.nasa.gov/news-release/nasas-spacex-crew-12-launches-to-international-space-station/" target="_blank" rel="noopener">NASA：Crew-12 发射</a>'
    },
    {
        name: 'SLC-41', lat: 28.583469, lng: -80.582879, siteName: 'Cape Canaveral SFS / ULA',
        content: 'ULA Atlas V 与 Vulcan 现役发射场。2026 年 2 月 Vulcan 从此处执行 USSF-87 任务；ULA 同年 8 月还在此进行面向 Amazon Leo 任务的 Vulcan 湿式彩排。<br><a href="https://newsroom.ulalaunch.com/releases/ula-vulcan-rocket-successfully-launches-the-future-of-defense" target="_blank" rel="noopener">ULA：Vulcan USSF-87</a> · <a href="https://blog.ulalaunch.com/blog/vulcan-wet-dress-rehearsal-planned" target="_blank" rel="noopener">ULA：2026 年 8 月彩排</a>'
    },
    {
        name: 'LC-48', lat: 28.599126, lng: -80.588699, siteName: 'Kennedy Space Center',
        content: 'NASA 建设的小型/中型运载器发射场。FAA 仍将其列为可支持此类运载器的场地；目前未能确认有已确定运营商或近期发射计划，暂按用途规划中/未确认投入发射处理。<br><a href="https://www.faa.gov/space/spaceports_by_state" target="_blank" rel="noopener">FAA：佛罗里达发射场列表</a>'
    },
    {
        name: 'LC-39A Starship', lat: 28.608197, lng: -80.600975, siteName: 'Kennedy Space Center / SpaceX',
        content: '位于 LC-39A 范围内的 Starship/Super Heavy 开发区域标注，不是独立的正式发射台编号。NASA 2026 年 7 月更新称相关场地方案仍在审查中。<br><a href="https://public.ksc.nasa.gov/environmental/starship-super-heavy-operations/" target="_blank" rel="noopener">NASA：Starship/Super Heavy 场地项目</a>'
    },
    {
        name: 'LC-39A', lat: 28.608310, lng: -80.604129, siteName: 'Kennedy Space Center / SpaceX',
        content: 'SpaceX 现役发射场，支持 Falcon 9 与 Falcon Heavy。NASA 发射记录显示，Roman Space Telescope 于 2026 年 8 月 30 日搭乘 Falcon Heavy 从 LC-39A 发射。<br><a href="https://public.ksc.nasa.gov/lsphistory/" target="_blank" rel="noopener">NASA：发射历史</a>'
    },
    {
        name: 'LC-39B', lat: 28.627108, lng: -80.620855, siteName: 'Kennedy Space Center / NASA',
        content: 'NASA Artemis 任务使用的 SLS 发射台。Artemis II 于 2026 年 4 月从此处发射；NASA 目前正为 Artemis III 做准备。原坐标列表中的“LC-30B”应更正为 LC-39B。<br><a href="https://www.nasa.gov/kennedy/partnerships/physicalassetsfaqs/" target="_blank" rel="noopener">NASA：LC-39B 近况</a>'
    },
    {
        name: 'LP-0B', lat: 37.831169, lng: -75.491318, siteName: 'MARS / Wallops Flight Facility',
        content: 'MARS 的固体燃料发射台，适用于小型至中型运载器，曾支持 Minotaur 系列任务。由 Virginia Spaceport Authority 运营。<br><a href="https://www.vaspace.org/our-facilities" target="_blank" rel="noopener">Virginia Space：MARS 设施</a>'
    },
    {
        name: 'LP-0D（Rocket Lab LC-3）', lat: 37.832222, lng: -75.489827, siteName: 'MARS / Wallops Flight Facility / Rocket Lab',
        content: 'Rocket Lab 在 Wallops 建设的 LC-3，面向 Neutron 运载火箭；属于新建中的重型火箭发射设施。<br><a href="https://www.rocketlabusa.com/launch/launch-complex-3/" target="_blank" rel="noopener">Rocket Lab：Launch Complex 3</a>'
    },
    {
        name: 'LP-0C（Rocket Lab LC-2）', lat: 37.833247, lng: -75.488218, siteName: 'MARS / Wallops Flight Facility / Rocket Lab',
        content: 'Rocket Lab Electron 与 HASTE 在美国东海岸的发射台。Virginia Space 已记录其 2026 年 2 月从 Pad 0-C 执行的 HASTE 发射。<br><a href="https://www.vaspace.org/completed-missions" target="_blank" rel="noopener">Virginia Space：已完成任务</a>'
    },
    {
        name: 'LP-0A', lat: 37.833870, lng: -75.487687, siteName: 'MARS / Wallops Flight Facility',
        content: '液体燃料发射台，历史上主要支持 Antares/Cygnus 货运任务；由 Virginia Spaceport Authority 运营。<br><a href="https://www.vaspace.org/our-facilities" target="_blank" rel="noopener">Virginia Space：MARS 设施</a>'
    },
    {
        name: 'ELS', lat: 5.304585, lng: -52.834530, siteName: '圭亚那航天中心（CSG）',
        content: '原 Soyuz 发射综合体，Soyuz 在库鲁的发射于 2022 年停止。旧场正在改造为 ELM2 多型号发射区，规划支持 Maia 等新型运载器。<br><a href="https://centrespatialguyanais.cnes.fr/en/installations-lancement" target="_blank" rel="noopener">CNES：发射设施与 ELM2</a>'
    },
    {
        name: 'ELA-4', lat: 5.264608, lng: -52.792065, siteName: '圭亚那航天中心（CSG） / Ariane 6',
        content: 'Ariane 6 专用发射综合体，是欧洲新一代重型运载火箭的发射设施。<br><a href="https://cnes.fr/projets/ariane-6/assemblage-lancement" target="_blank" rel="noopener">CNES：ELA-4 与 Ariane 6</a>'
    },
    {
        name: 'ELV', lat: 5.236630, lng: -52.774939, siteName: '圭亚那航天中心（CSG） / Vega-C',
        content: 'Vega-C 使用的发射场，沿用并改造自原 Ariane 1 发射区。CNES 记录显示，Vega-C 于 2026 年 9 月从该中心成功发射 VV30。<br><a href="https://centrespatialguyanais.cnes.fr/en/installations-lancement" target="_blank" rel="noopener">CNES：Vega-C 发射设施</a>'
    },
    {
        name: 'ELD', lat: 5.233521, lng: -52.752296, siteName: '圭亚那航天中心（CSG） / ELM',
        content: '原 Diamant 发射区，现改造为 ELM 多型号发射综合体，面向欧洲商业小型与微型运载器。CNES 于 2026 年公布 Sirius Space 入驻该区域。<br><a href="https://centrespatialguyanais.cnes.fr/en/news/elm-diamant-launch-complex-space-history-making" target="_blank" rel="noopener">CNES：ELM/Diamant 改造</a>'
    },
    {
        name: 'Orbital Launch Pad（Isar Launch Pad A）', lat: 69.108266, lng: 15.590872, siteName: '安多亚太空港（Andøya Spaceport）',
        content: '安多亚太空港为 Isar Aerospace 的 Spectrum 运载火箭提供轨道发射场地。2026 年 9 月，Spectrum 在此完成一次成功的卫星发射，成为欧洲大陆首次成功的轨道卫星发射。<br><a href="https://andoyaspace.no/news-articles/vi-er-stolte-av-a-ha-bidratt-til-a-skape-historie/" target="_blank" rel="noopener">Andøya Space：成功发射回顾</a>'
    },
    {
        name: 'Innospace Pad', lat: -2.317641, lng: -44.368004, siteName: '阿尔坎塔拉航天中心（CLA）',
        content: 'INNOSPACE 在阿尔坎塔拉的商业发射台。2026 年 8 月，SEBIT 首次试飞在正常离台后因飞行轨迹异常被安全终止；HANBIT-Nano 后续任务仍在准备中。<br><a href="https://www.innospc.com/myboard/sub04_02/994684" target="_blank" rel="noopener">INNOSPACE：SEBIT 首飞情况</a>'
    },
    {
        name: 'PAD1', lat: 25.996301, lng: -97.154399, siteName: 'Starbase / SpaceX',
        content: 'Starbase 南德克萨斯发射场的发射设施。该区域用于 SpaceX Starship 项目。'
    },
    {
        name: 'PAD2', lat: 25.997169, lng: -97.156870, siteName: 'Starbase / SpaceX',
        content: 'Starbase 南德克萨斯发射场的另一处发射设施。该区域用于 SpaceX Starship 项目。'
    },
    {
        name: 'Launch Site One', lat: 31.422879, lng: -104.757178, siteName: 'Blue Origin / West Texas',
        content: 'Blue Origin 位于德克萨斯州西部的亚轨道发射场，用于 New Shepard 亚轨道飞行任务。'
    },
    {
        name: 'SLC-11', lat: 34.576364, lng: -120.632014, siteName: 'Vandenberg Space Force Base',
        content: '范登堡太空军基地内的历史发射综合体，现为退役设施。'
    },
    {
        name: 'SLC-6', lat: 34.581333, lng: -120.626365, siteName: 'Vandenberg Space Force Base',
        content: '范登堡太空军基地的发射综合体，曾为多种运载火箭和任务进行改造。'
    },
    {
        name: 'SLC-4E', lat: 34.632029, lng: -120.610647, siteName: 'Vandenberg Space Force Base / SpaceX',
        content: 'SpaceX Falcon 9 在范登堡的现役发射台，主要执行极轨及太阳同步轨道任务。'
    },
    {
        name: 'SLC-4W', lat: 34.633146, lng: -120.615812, siteName: 'Vandenberg Space Force Base',
        content: '范登堡 SLC-4 西侧历史发射区，现主要作为助推器着陆区域使用。'
    },
    {
        name: 'SLC-3E', lat: 34.640080, lng: -120.589481, siteName: 'Vandenberg Space Force Base / ULA',
        content: 'ULA 在范登堡的现役发射台，服务 Atlas V 与 Vulcan 等任务。'
    },
    {
        name: 'SLC-576E', lat: 34.739587, lng: -120.619085, siteName: 'Vandenberg Space Force Base',
        content: '范登堡基地内的发射综合体标记。'
    },
    {
        name: 'SLC-2W', lat: 34.755622, lng: -120.622357, siteName: 'Vandenberg Space Force Base',
        content: '范登堡基地内的历史发射综合体，现已停止原有发射任务。'
    },
    {
        name: 'Rocket Lab LC-1A', lat: -39.261602, lng: 177.865066, siteName: 'Rocket Lab Launch Complex 1 / Mahia',
        content: 'Rocket Lab 位于新西兰马希亚的 LC-1A 发射台，用于 Electron 任务。'
    },
    {
        name: 'Rocket Lab LC-1B', lat: -39.260682, lng: 177.865147, siteName: 'Rocket Lab Launch Complex 1 / Mahia',
        content: 'Rocket Lab 位于新西兰马希亚的 LC-1B 发射台，与 LC-1A 共同组成 Launch Complex 1。'
    },
    {
        name: 'Orbital Launch Pad', lat: -19.957920, lng: 148.113022, siteName: '鲍文轨道航天港（Bowen Orbital Spaceport）',
        content: '鲍文轨道航天港位于澳大利亚昆士兰州，是澳大利亚首个获准实施轨道发射活动的商业发射场。'
    },
    {
        name: 'First Launch Pad', lat: 13.733323, lng: 80.234795, siteName: '萨迪什·达万航天中心（SDSC）',
        content: '萨迪什·达万航天中心的第一发射台，服务印度运载火箭任务。'
    },
    {
        name: 'Second Launch Pad', lat: 13.719701, lng: 80.230276, siteName: '萨迪什·达万航天中心（SDSC）',
        content: '萨迪什·达万航天中心的第二发射台，支持多型印度运载火箭。'
    },
    {
        name: 'Palmachim Pad 1', lat: 31.884702, lng: 34.680190, siteName: '帕尔马希姆空军基地',
        content: '帕尔马希姆基地的发射台，用于以色列运载火箭及相关航天任务。'
    },
    {
        name: 'Safir Launch Pad', lat: 35.234615, lng: 53.920938, siteName: '塞姆南航天中心',
        content: '塞姆南航天中心的 Safir 运载火箭发射台。'
    },
    {
        name: 'Imam Khomeini Spaceport', lat: 35.237016, lng: 53.950552, siteName: '伊玛目霍梅尼航天发射场',
        content: '伊朗伊玛目霍梅尼航天发射场，位于塞姆南省，支持伊朗轨道运载火箭任务。'
    },
    {
        name: 'Launch Platform', lat: 36.200577, lng: 55.333922, siteName: '沙赫鲁德导弹测试场',
        content: '沙赫鲁德导弹测试场（Shahroud Missile Test Site）位于伊朗塞姆南省沙赫鲁德市近郊，约于 1998 年启用，是伊朗重要的固体燃料弹道导弹与军用卫星试验、发射基地，由伊斯兰革命卫队航空航天部队管辖。'
    },
    {
        name: 'Site 43/3', lat: 62.927257, lng: 40.449509, siteName: '普列谢茨克航天发射场',
        content: '普列谢茨克航天发射场 Site 43/3 工位。'
    },
    {
        name: 'Site 43/4', lat: 62.928841, lng: 40.456525, siteName: '普列谢茨克航天发射场',
        content: '普列谢茨克航天发射场 Site 43/4 工位。'
    },
    {
        name: 'Site 35/1', lat: 62.927918, lng: 40.574809, siteName: '普列谢茨克航天发射场',
        content: '普列谢茨克航天发射场 Site 35/1 工位。'
    },
    {
        name: 'Site 133/3', lat: 62.886974, lng: 40.847069, siteName: '普列谢茨克航天发射场',
        content: '普列谢茨克航天发射场 Site 133/3 工位。'
    },
    {
        name: 'Site 81/24', lat: 46.070884, lng: 62.984624, siteName: '拜科努尔航天发射场',
        content: '拜科努尔航天发射场 Site 81/24 工位。'
    },
    {
        name: 'Site 200/39', lat: 46.039600, lng: 63.031647, siteName: '拜科努尔航天发射场',
        content: '拜科努尔航天发射场 Site 200/39 工位。'
    },
    {
        name: 'Site 31/6', lat: 45.996112, lng: 63.564155, siteName: '拜科努尔航天发射场',
        content: '拜科努尔航天发射场 Site 31/6 工位。'
    },
    {
        name: 'Site 45/1', lat: 45.943276, lng: 63.652939, siteName: '拜科努尔航天发射场',
        content: '拜科努尔航天发射场 Site 45/1 工位。'
    },
    {
        name: 'Site 1S', lat: 51.884174, lng: 128.334872, siteName: '东方航天发射场',
        content: '东方航天发射场 Site 1S 工位。'
    },
    {
        name: 'Site 1A', lat: 51.874928, lng: 128.358394, siteName: '东方航天发射场',
        content: '东方航天发射场 Site 1A 工位。'
    },
    {
        name: 'Site 2A', lat: 51.871563, lng: 128.382564, siteName: '东方航天发射场',
        content: '东方航天发射场 Site 2A 工位。'
    },
    {
        name: 'Pad 1', lat: 39.660010, lng: 124.705343, siteName: '西海卫星发射场',
        content: '西海卫星发射场 Pad 1 工位。'
    },
    {
        name: 'Pad 2', lat: 39.652704, lng: 124.736341, siteName: '西海卫星发射场',
        content: '西海卫星发射场 Pad 2 工位。'
    },
    {
        name: 'LC-2', lat: 34.431864, lng: 127.534148, siteName: '罗老航天中心',
        content: '罗老航天中心 LC-2 发射工位。'
    },
    {
        name: 'LC-1', lat: 34.431830, lng: 127.536230, siteName: '罗老航天中心',
        content: '罗老航天中心 LC-1 发射工位。'
    },
    {
        name: 'LA-Y2', lat: 30.400941, lng: 130.975581, siteName: '种子岛航天中心',
        content: '种子岛航天中心 LA-Y2 发射工位。'
    },
    {
        name: 'LA-Y1', lat: 30.400976, lng: 130.977541, siteName: '种子岛航天中心',
        content: '种子岛航天中心 LA-Y1 发射工位。'
    },
    {
        name: 'Space One Launch Pad', lat: 33.544263, lng: 135.889436, siteName: 'Space One Launch Pad',
        content: '和歌山县串本町 Space One Launch Pad。'
    },
    {
        name: 'Mu Pad', lat: 31.251006, lng: 131.082024, siteName: '内之浦航天中心',
        content: '内之浦航天中心 Mu Pad 发射工位。'
    }
];
var launchPadMarkers = [];
var landingZoneMarkers = [];

const MSI_AEROSPACE_KEYWORDS = ["ROCKET", "LAUNCH", "SPACE", "RE-ENTRY", "REENTRY", "DEBRIS", "AEROSPACE", "SATELLITE", "MISSILE", "SPACECRAFT"];

// 世界复制数量：左侧 10 个 + 右侧 10 个 + 当前世界
const WRAP_WORLD_COPIES_PER_SIDE = 10;
const WRAP_WORLD_LNG_SPAN = 360;
const WRAP_WORLD_OFFSETS = (() => {
    const offsets = [];
    for (let i = -WRAP_WORLD_COPIES_PER_SIDE; i <= WRAP_WORLD_COPIES_PER_SIDE; i++) {
        offsets.push(i * WRAP_WORLD_LNG_SPAN);
    }
    return offsets;
})();

// 海外发射场开关：0=不绘制，1=绘制
var drawForeignLaunchSite = 1;

// 海南发射场相关标记（用于缩放级别切换）
var hainanMergedMarker = null;
var hainanSeparateMarkers = [];

// 存储原始样式以便恢复
var originalPolygonStyles = {};

/* 航警列表 hover 高亮指定多边形 */
function hoverHighlightNotam(idx) {
    if (mapViewMode === '3d' && window.NotamGlobe) {
        window.NotamGlobe.highlight('auto-' + idx, true);
        return;
    }
    const poly = polygonAuto[idx];
    if (!poly) return;
    
    // 第一次高亮时保存原始样式
    if (!originalPolygonStyles[idx]) {
        const style = poly.__baseStyle || poly.options || {};
        originalPolygonStyles[idx] = {
            weight: style.weight || 1,
            fillOpacity: style.fillOpacity ?? 0.5,
            opacity: style.opacity ?? 1,
            color: style.color,
            fillColor: style.fillColor || style.color
        };
    }
    
    const saved = originalPolygonStyles[idx];
    
    // 应用高亮样式：边框加粗 + 填充透明度提高（使用保存的原色）
    poly.setStyle({
        weight: 4,
        fillOpacity: 0.7,
        opacity: 1,
        color: saved.color,
        fillColor: saved.fillColor
    });
    
    // 将该多边形置于顶层
    if (poly.bringToFront) {
        poly.bringToFront();
    }
}

/* 列表 hover 取消高亮 */
function hoverUnhighlightNotam(idx) {
    if (mapViewMode === '3d' && window.NotamGlobe) {
        window.NotamGlobe.highlight('auto-' + idx, false);
        return;
    }
    const poly = polygonAuto[idx];
    if (!poly) return;
    
    const saved = originalPolygonStyles[idx];
    if (saved) {
        poly.setStyle({
            weight: saved.weight,
            fillOpacity: saved.fillOpacity,
            opacity: saved.opacity,
            color: saved.color,
            fillColor: saved.fillColor
        });
    }
}

var tileLayers = {
    //天地图矢量图层
    tianditu_vec: {
        url: 'http://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: '&copy; 天地图'
        }
    },
    tianditu_vec_anno: {
        url: 'http://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: ''
        }
    },
    //天地图影像图层
    tianditu_img: {
        url: 'http://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: '&copy; 天地图'
        }
    },
    tianditu_img_anno: {
        url: 'http://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=',
        options: {
            subdomains: ['0'],
            attribution: ''
        }
    },
    // Bing 中文街道图（四叉树 q 参数由 createBingLayer 生成）
    bing_vec: {
        url: 'https://t1.dynamic.tiles.ditu.live.com/comp/ch/{q}?mkt=zh-CN&ur=CN&it=G,LA&og=767&n=z',
        options: {
            attribution: '&copy; Microsoft Bing Maps',
            maxZoom: 19
        }
    },
    // Bing 卫星图：航空影像叠加中文道路与地名/POI 注记。
    bing_img: {
        url: 'https://ecn.t3.tiles.virtualearth.net/tiles/a{q}.jpeg?g=1',
        options: {
            attribution: '&copy; Microsoft Bing Maps',
            maxZoom: 19
        }
    },
    // Bing 卫星注记层：在纯影像首屏完成后再异步加载。
    bing_img_anno: {
        url: 'https://t1.dynamic.tiles.ditu.live.com/comp/ch/{q}?mkt=zh-CN&ur=CN&it=Z,GF,L&og=767&n=z',
        options: {
            attribution: '',
            maxZoom: 19
        }
    },
    //高德地图
    gaode_vec: {
        url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: '&copy; 高德地图'
        }
    },
    gaode_img: {
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: '&copy; 高德地图'
        }
    },
    gaode_img_anno: {
        url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
        options: {
            subdomains: ['1', '2', '3', '4'],
            attribution: ''
        }
    },
};

// 矢量图层颜色池（聚焦段以外的航警）
const colorPoolVector = [
    "#a70000ff", "#1a2cd1", "#006d1bff", "#806800ff", "#6a009bff",
    "#548100ff", "#a74e00ff", "#313131", "#a0008bff", "#006b79ff"
];

// 卫星图层颜色池（聚焦段以外的航警）
const colorPoolSatellite = [
    "#ff3b3b", "#00d9ff", "#00ff41", "#ffea00", "#c300ffff",
    "#7dff00", "#ff8c00", "#ffffff", "#ff1493", "#00ffff"
];

// 聚焦段（[ICAO_FOCUSED]）专用颜色池：与全量池错开，保证两类航警一眼可分
const colorPoolVectorFocused = [
    "#00b7d4ff", "#ff3d8bff", "#7a4bffff", "#00b050ff", "#ff7a00ff",
    "#c200c2ff", "#4a4affff", "#00a3a3ff", "#ff5c5cff", "#8fa300ff"
];

const colorPoolSatelliteFocused = [
    "#00e5ffff", "#ff2d95ff", "#b388ffff", "#00ff9dff", "#ffaa00ff",
    "#ff00e5ff", "#6ec6ffff", "#00ffd5ff", "#ff6b6bff", "#e8ff3aff"
];

// MSI 独立颜色池：不复用任何 NOTAM（聚焦或外部段）颜色。
const colorPoolVectorMsi = [
    "#004d40", "#5d4037", "#37474f", "#6d1b7b", "#0d47a1",
    "#bf360c", "#33691e", "#3e2723", "#01579b", "#4e342e"
];

const colorPoolSatelliteMsi = [
    "#ff6f00", "#76ff03", "#40c4ff", "#ff4081", "#b2ff59",
    "#ff80ab", "#18ffff", "#ffd740", "#ea80fc", "#84ffff"
];

// USCG NOTMAR 独立颜色池：与 NOTAM/MSI 均不复用。
const colorPoolVectorNotmar = [
    "#5b21b6", "#7c2d12", "#9d174d", "#1e3a8a", "#155e75",
    "#713f12", "#4c1d95", "#831843", "#0f766e", "#7f1d1d"
];
const colorPoolSatelliteNotmar = [
    "#d8b4fe", "#fdba74", "#f9a8d4", "#93c5fd", "#67e8f9",
    "#fde047", "#c4b5fd", "#fda4af", "#5eead4", "#fca5a5"
];

// 当前使用的颜色池
let currentColorPool = colorPoolVector;
let currentFocusedColorPool = colorPoolVectorFocused;
let currentMsiColorPool = colorPoolVectorMsi;
let currentNotmarColorPool = colorPoolVectorNotmar;
let currentColor_idx = 0;

function randomColor() {
    return currentColorPool[currentColor_idx++ % currentColorPool.length];
}

// 根据地图类型切换颜色池
function switchColorPool(isVectorMap) {
    currentColorPool = isVectorMap ? colorPoolVector : colorPoolSatellite;
    currentFocusedColorPool = isVectorMap ? colorPoolVectorFocused : colorPoolSatelliteFocused;
    currentMsiColorPool = isVectorMap ? colorPoolVectorMsi : colorPoolSatelliteMsi;
    currentNotmarColorPool = isVectorMap ? colorPoolVectorNotmar : colorPoolSatelliteNotmar;
    currentColor_idx = 0; // 重置索引
}

// 检查当前地图是否为矢量图层
function isVectorMap() {
    return currentMapProvider === 'bing_vec' || currentMapProvider === 'gaode_vec' || currentMapProvider === 'tianditu_vec';
}
// ==================== 颜色系统结束 ====================

function getRandomTileLayer() {
    var savedProvider = window.NotamAppSettings && window.NotamAppSettings.get('mapProvider');
    if (savedProvider && tileLayers[savedProvider]) return savedProvider;
    var providers = [
        'gaode_vec',     // 高德矢量
        // 'bing_vec',      // Bing 中文街道
        // 'gaode_img',     // 高德影像
        // 'tianditu_vec',  // 天地图矢量
        // 'tianditu_img'   // 天地图影像
    ];
    
    var randomProvider = providers[Math.floor(Math.random() * providers.length)];
    console.log('使用地图源:', randomProvider);
    
    return randomProvider;
}

//当前使用的地图源
var currentMapProvider = getRandomTileLayer();
var currentBaseLayer = null;
var currentAnnoLayer = null;
// 卫星地图注记的显示状态；切换 Bing / 高德底图时保持此选择。
var satelliteLabelsVisible = true;
if (window.NotamAppSettings) satelliteLabelsVisible = window.NotamAppSettings.get('satelliteLabelsVisible', true) !== false;

switchColorPool(currentMapProvider === 'bing_vec' || currentMapProvider === 'gaode_vec' || currentMapProvider === 'tianditu_vec');


function handleCopy(text) {
    // 通用复制函数，兼容安卓 WebView
    function fallbackCopy(str) {
        const textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.setAttribute('readonly', ''); // 防止移动端弹出键盘
        document.body.appendChild(textarea);
        
        // 针对 iOS 的特殊处理
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textarea.setSelectionRange(0, str.length); // 安卓需要这个
        
        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (e) {
            console.error('execCommand copy failed:', e);
        }
        document.body.removeChild(textarea);
        return success;
    }
    
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(() => {
            showNotification("成功复制到剪贴板");
        }).catch(err => {
            // Clipboard API 失败，使用回退方案
            if (fallbackCopy(text)) {
                showNotification("成功复制到剪贴板");
            } else {
                showNotification("复制失败，请手动复制");
            }
        });
    } else {
        // 不支持 Clipboard API，直接使用回退方案
        if (fallbackCopy(text)) {
            showNotification("成功复制到剪贴板");
        } else {
            showNotification("复制失败，请手动复制");
        }
    }
}

// 初始化地图
makeMap();
function makeMap() {
    // 地图聚焦位置和缩放级别不持久化；清理旧版本保存过的视图设置。
    if (window.NotamAppSettings && window.NotamAppSettings.remove) {
        window.NotamAppSettings.remove('mapView');
        window.NotamAppSettings.remove('mapZoom');
    }
    var initialCenter = [36, 103];
    var initialZoom = 4;
    // 创建Leaflet地图
    map = L.map('allmap', {
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 3,
        worldCopyJump: false,
        zoomControl: false,  // 关闭默认缩放控件，稍后添加到右下角
        attributionControl: false,  // 关闭默认版权控件
        
    });

    map.getPane('overlayPane').style.zIndex = 400;
    // 发射场、工位和回收场标记要覆盖 NOTAM/MSI/NOTMAR 多边形（400–402）。
    map.getPane('markerPane').style.zIndex = 600;
    // 自动航警按来源固定分层：NOTAM 最上、MSI 居中、USCG NOTMAR 最下。
    // pane 的层级同时决定可见覆盖与鼠标命中顺序，因此重合时优先点击 NOTAM。
    map.createPane('autoNotmarPane').style.zIndex = 400;
    map.createPane('autoMsiPane').style.zIndex = 401;
    map.createPane('autoNotamPane').style.zIndex = 402;

    // 添加缩放控件到右下角
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // 添加自定义版权信息
    L.control.attribution({
        position: 'bottomright',
        prefix: 'NOTAM航警落区绘制工具 by 叁点壹肆壹伍 Joey0609'
    }).addTo(map);

    // 添加比例尺
    L.control.scale({
        metric: true,
        imperial: false,
        position: 'bottomleft'
    }).addTo(map);

// 添加图层切换控件
    addLayerControl();

    if (!currentBaseLayer) {
        addMapLayers(currentMapProvider);
    }

    // 初始化发射场标记
    siteInit();
}

// Bing 的瓦片 URL 使用四叉树编码，Leaflet 原生 XYZ 模板不提供 {q}，在此转换。
function bingQuadKey(x, y, z) {
    var key = '';
    for (var i = z; i > 0; i--) {
        var digit = 0;
        var mask = 1 << (i - 1);
        if ((x & mask) !== 0) digit += 1;
        if ((y & mask) !== 0) digit += 2;
        key += digit;
    }
    return key;
}

function createBingLayer(provider) {
    var config = tileLayers[provider];
    var layer = L.tileLayer(config.url, config.options);
    layer.getTileUrl = function (coords) {
        return L.Util.template(this._url, { q: bingQuadKey(coords.x, coords.y, coords.z), x: coords.x, y: coords.y, z: coords.z });
    };
    return layer;
}
// 添加地图图层
function addMapLayers(provider) {
    if (window.NotamAppSettings) window.NotamAppSettings.set('mapProvider', provider);
    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
        currentBaseLayer = null;
    }
    if (currentAnnoLayer) {
        map.removeLayer(currentAnnoLayer);
        currentAnnoLayer = null;
    }
    var baseConfig = tileLayers[provider];
    if (baseConfig) {
        var tileUrl = baseConfig.url;
        
        if (provider.startsWith('tianditu')) {
            var tdtKeys = [
                'ad322867b18949f56e94e4fca2cfdfa2',
            ];
            var randomKey = tdtKeys[Math.floor(Math.random() * tdtKeys.length)];
            tileUrl += randomKey;
        }

        var nextBaseLayer = provider.startsWith('bing_') ? createBingLayer(provider) : L.tileLayer(tileUrl, baseConfig.options);
        if (provider === 'bing_img') {
            // 首张卫星瓦片可见后立即请求注记，不等待整屏底图完成。
            nextBaseLayer.once('tileload', function () {
                if (currentBaseLayer !== nextBaseLayer || currentAnnoLayer || !satelliteLabelsVisible) return;
                addSatelliteAnnotationLayer('bing_img');
            });
        }
        currentBaseLayer = nextBaseLayer;
        currentBaseLayer.addTo(map);
        if (provider === 'tianditu_vec') {
            var annoConfig = tileLayers.tianditu_vec_anno;
            currentAnnoLayer = L.tileLayer(annoConfig.url + randomKey, annoConfig.options).addTo(map);
        } else if (provider === 'tianditu_img') {
            var annoConfig = tileLayers.tianditu_img_anno;
            currentAnnoLayer = L.tileLayer(annoConfig.url + randomKey, annoConfig.options).addTo(map);
        } else if (provider === 'gaode_img') {
            addSatelliteAnnotationLayer('gaode_img');
        }
    }
}

// 卫星注记独立于底图：Bing 用前景中文注记层，高德用其文字注记层。
function addSatelliteAnnotationLayer(provider) {
    if (!map || !satelliteLabelsVisible || currentAnnoLayer) return;
    if (provider === 'bing_img') {
        currentAnnoLayer = createBingLayer('bing_img_anno').addTo(map);
    } else if (provider === 'gaode_img') {
        var annoConfig = tileLayers.gaode_img_anno;
        currentAnnoLayer = L.tileLayer(annoConfig.url, annoConfig.options).addTo(map);
    }
}

function setSatelliteLabelsVisible(visible) {
    satelliteLabelsVisible = !!visible;
    if (window.NotamAppSettings) window.NotamAppSettings.set('satelliteLabelsVisible', satelliteLabelsVisible);
    if (currentAnnoLayer) {
        map.removeLayer(currentAnnoLayer);
        currentAnnoLayer = null;
    }
    if (satelliteLabelsVisible && (currentMapProvider === 'bing_img' || currentMapProvider === 'gaode_img')) {
        addSatelliteAnnotationLayer(currentMapProvider);
    }
}

function setSatelliteProvider(provider) {
    if (provider !== 'bing_img' && provider !== 'gaode_img') return;
    if (currentMapProvider === provider) return;
    currentMapProvider = provider;
    switchColorPool(false);
    addMapLayers(provider);
    if (dict && (dict.CLASSIFY || dict.CLASSIFY_FOCUSED)) {
        assignAllGroupColors(dict.CLASSIFY_FOCUSED, dict.CLASSIFY);
        redrawAllNotams();
    }
    mapViewMode = '2d';
    if (window.NotamAppSettings) window.NotamAppSettings.set('mapMode', provider === 'bing_img' || provider === 'gaode_img' ? 'satellite' : 'vector');
    updateMapModeControl();
}

window.setSatelliteLabelsVisible = setSatelliteLabelsVisible;
window.setSatelliteProvider = setSatelliteProvider;
// 添加图层切换控件
function addLayerControl() {
    var control = document.getElementById('mapModeControl');
    if (!control || control.__bound) return;
    control.__bound = true;
    control.addEventListener('click', function(event) {
        var button = event.target.closest('button[data-map-mode]');
        if (!button) return;
        selectMapMode(button.dataset.mapMode);
    });
    updateMapModeControl();
}

function updateMapModeControl() {
    var control = document.getElementById('mapModeControl');
    if (!control) return;
    var modes = ['vector', 'satellite', 'globe'];
    var activeMode = mapViewMode === '3d' ? 'globe' : ((currentMapProvider === 'gaode_img' || currentMapProvider === 'bing_img') ? 'satellite' : 'vector');
    var satelliteActive = mapViewMode !== '3d' && (currentMapProvider === 'gaode_img' || currentMapProvider === 'bing_img');
    document.body.classList.toggle('satellite-active', satelliteActive);
    if (!satelliteActive && typeof window.closeSatelliteFxArea === 'function') window.closeSatelliteFxArea();
    control.style.setProperty('--active-index', String(Math.max(0, modes.indexOf(activeMode))));
    control.querySelectorAll('button[data-map-mode]').forEach(function(button) {
        var active = button.dataset.mapMode === activeMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function selectMapMode(mode) {
    var activeMode = mapViewMode === '3d' ? 'globe' : ((currentMapProvider === 'gaode_img' || currentMapProvider === 'bing_img') ? 'satellite' : 'vector');
    // 已经处于该模式时不重复销毁/创建图层，也不重新触发地图动画。
    if (mode === activeMode) return;
    if (mode === 'globe') {
        if (window.NotamGlobe) {
            if (window.NotamAppSettings) window.NotamAppSettings.set('mapMode', 'globe');
            window.NotamGlobe.enter();
        }
        return;
    }
    if (window.NotamGlobe && window.NotamGlobe.isActive()) window.NotamGlobe.leave();
    currentMapProvider = mode === 'satellite' ? 'gaode_img' : 'gaode_vec';
    switchColorPool(currentMapProvider === 'gaode_vec' || currentMapProvider === 'tianditu_vec');
    addMapLayers(currentMapProvider);
    if (dict && (dict.CLASSIFY || dict.CLASSIFY_FOCUSED)) {
        assignAllGroupColors(dict.CLASSIFY_FOCUSED, dict.CLASSIFY);
        redrawAllNotams();
    }
    mapViewMode = '2d';
    if (window.NotamAppSettings) window.NotamAppSettings.set('mapMode', mode === 'satellite' ? 'satellite' : 'vector');
    updateMapModeControl();
    if (window.NotamGlobe) window.NotamGlobe.refresh(true);
}
function redrawAllNotams() {
    if (!dict || dict.NUM === 0) return;
    
    var currentVisibleState = Object.assign({}, visibleState);
    
    // 只重绘自动航警，不影响历史航警
    for (let i = 0; i < polygonAuto.length; i++) {
        if (polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    polygonAuto = [];
    originalPolygonStyles = {};  // 清除缓存的样式
    
    for (var i = 0; i < dict.NUM; i++) {
        var color = getColorForRecord(i);
        drawNot(dict.TIME[i], dict.CODE[i], dict.ALTITUDE[i], i, color, 0, dict.RAWMESSAGE[i], dict.SOURCE?.[i] || 'NOTAM', dict.FIR?.[i] || '', dict.GEOMETRY?.[i] || '');
        
        if (currentVisibleState[i] === false && polygonAuto[i]) {
            map.removeLayer(polygonAuto[i]);
        }
    }
    
    visibleState = currentVisibleState;
    if (typeof applyNotamTypeFilter === 'function') applyNotamTypeFilter();
    if (window.NotamGlobe) window.NotamGlobe.refresh(true);
}

// 初始化发射场标记
function siteInit() {
    var screen_width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    if (screen_width > 1000) screen_width = 1000;
    var opt_width = screen_width / 3 < 100 ? 100 : screen_width / 3;

    var sites = [
        {
            name: '酒泉卫星发射中心',
            lat: 40.96806,
            lng: 100.27806,
            icon: 'statics/launch.png',
            content: "<b><large>甘肃酒泉</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/酒泉卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>酒泉卫星发射中心</a>（Jiuquan Satellite Launch Center，JSLC，又称东风航天城）</b>，是中国创建最早、规模最大的综合型导弹、卫星发射中心，也是中国目前唯一的载人航天发射场。"
        },
        {
            name: '西昌卫星发射中心',
            lat: 28.24556,
            lng: 102.02667,
            icon: 'statics/launch.png',
            content: "<b><large>四川西昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/西昌卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>西昌卫星发射中心</a>（Xichang Satellite Launch Center，XSLC）</b>始建于1970年，于1982年交付使用，自1984年1月发射中国第一颗通信卫星以来，到如今已进行国内外卫星发射超过百次。"
        },
        {
            name: '太原卫星发射中心',
            lat: 38.84861,
            lng: 111.60778,
            icon: 'statics/launch.png',
            content: "<b><large>山西太原</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/太原卫星发射中心' target='_blank' style='text-decoration: none; font-weight: bold;'>太原卫星发射中心</a>（Taiyuan Satellite Launch Center, TSLC）</b>，位于山西省忻州市岢岚县北18公里处，是中国试验卫星、应用卫星和运载火箭发射试验基地之一。"
        },
        {
            name: '文昌航天发射场',
            lat: 19.614379-0.004,
            lng: 110.950996+0.004,
            icon: 'statics/launch.png',
            content: "<b><large>海南文昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/文昌航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>文昌航天发射场</a>" +
                "（Wenchang Spacecraft Launch Site, WSLS）</b>位于中国海南省文昌市，是中国首座滨海航天发射场，也是世界现有的少数低纬度航天发射场之一。"
        }, 
        {
            name: '海南商业航天发射场',
            lat: 19.596983-0.004,
            lng: 110.930836+0.004,
            icon: 'statics/launch.png',
            content: "<b><large>海南文昌</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/海南商业航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>海南商业航天发射场</a>（Hainan Commercial Spacecraft Launch Site）</b>，是我国首个开工建设的商业航天发射场，由海南国际商业航天发射有限公司投建，致力于打造国际一流、市场化运营的航天发射场，进一步提升我国民商运载火箭发射能力。"
        },
        {
            name: '海阳东方航天港',
            lat: 36.688761,
            lng: 121.259377,
            icon: 'statics/launch1.png',
            content: "<b><large>山东海阳</large></b><br>" +
                "<b><a href='https://baike.baidu.com/item/中国东方航天港' target='_blank' style='text-decoration: none; font-weight: bold;'>海阳东方航天港</a>（Haiyang Oriental Spaceport）</b>是中国唯一一个运载火箭海上发射母港。"
        }
    ];

    sites.forEach(function(site) {
        // 跳过海南的两个发射场，单独处理
        if (site.name === '文昌航天发射场' || site.name === '海南商业航天发射场') {
            return;
        }
        drawLaunchsite(site.lat, site.lng, site.name, site.content, site.icon);
    });

    // 初始化海南发射场标记（根据缩放级别决定合并或分离）
    initHainanSites(sites);
    
    // 监听地图缩放事件，动态切换海南发射场显示模式
    map.on('zoomend', function() {
        updateHainanSitesDisplay(sites);
        updateLaunchSiteZoomDisplay();
    });
    var landingZones = [
        {
            name: '蓝箭航天火箭回收着陆场',
            //38.445084, 103.480743
            lat: 38.445084,
            lng: 103.480743,
            icon: 'statics/land1.png',
            content: "<b><large>甘肃民勤</large></b><br>" +
                "<b>蓝箭航天火箭回收着陆场</b>，位于甘肃武威市民勤县境内，是蓝箭航天用于其可回收运载火箭朱雀三号的着陆场。"
        },
        {
            name: 'CZ-12A火箭回收着陆场',
            //39°02'38.4"N 101°55'22.8"E
            lat: 39.043999,
            lng: 101.922999,
            icon: 'statics/land2.png',
            content: "<b><large>甘肃民勤</large></b><br>" +
                "<b>CZ-12A火箭回收着陆场</b>，位于甘肃武威市民勤县境内，是用于CZ-12A等运载火箭一级回收的着陆场。"
        },
        {
            name: 'SpaceX LZ-1',
            lat: 28.485737,
            lng: -80.542929,
            icon: 'statics/landing-spacex.svg',
            showOnlyAtZoom13: true,
            content: "<b><large>美国佛罗里达·卡纳维拉尔角</large></b><br><b>SpaceX LZ-1</b>，猎鹰 9 号一级助推器陆上回收着陆区。"
        },
        {
            name: 'SpaceX LZ-2',
            lat: 28.487751,
            lng: -80.544946,
            icon: 'statics/landing-spacex.svg',
            showOnlyAtZoom13: true,
            content: "<b><large>美国佛罗里达·卡纳维拉尔角</large></b><br><b>SpaceX LZ-2</b>，猎鹰 9 号一级助推器陆上回收着陆区。"
        },
        {
            name: 'SpaceX LZ-40',
            lat: 28.563522,
            lng: -80.574351,
            icon: 'statics/landing-spacex.svg',
            showOnlyAtZoom13: true,
            content: "<b><large>美国佛罗里达·卡纳维拉尔角</large></b><br><b>SpaceX LZ-40</b>，SpaceX 位于 SLC-40 附近的助推器回收着陆区。"
        }
    ];

    landingZones.forEach(function(landingZone) {
        drawLandingZone(landingZone.lat, landingZone.lng, landingZone.name, landingZone.content, landingZone.icon, landingZone.showOnlyAtZoom13);
    });

    if (Number(drawForeignLaunchSite) === 1) {
        drawForeignLaunchSites();
    }
    initializeLaunchPadMarkers();
    updateLaunchSiteZoomDisplay();
}

// 绘制发射场标记
function drawLaunchsite(lat, lng, title, content, iconUrl, isForeign) {
    var markerGroup = createWrappedMarkerGroup(lat, lng, createLaunchSiteIcon('site'), content);
    markerGroup._launchSiteLatLng = [lat, lng];
    markerGroup._isForeignLaunchSite = !!isForeign;
    markerGroup.addTo(map);
    launchSiteMarkers.push(markerGroup);
    allLaunchSiteGroups.push(markerGroup);
}

// 发射场与工位使用独立的简洁 SVG 图标；工位图标预留给有可靠坐标的数据。
function createLaunchSiteIcon(kind) {
    if (kind === 'point') {
        return L.divIcon({ className: 'launch-map-icon launch-map-point launch-marker-enter', html: '<span></span>', iconSize: [12, 12], iconAnchor: [6, 6] });
    }
    // 发射场与工位统一使用项目原有图标。
    return L.icon({ iconUrl: 'statics/launch.png', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -40], className: 'launch-marker-enter' });
}

function createLandingZonePointIcon() {
    return L.divIcon({
        className: 'landing-map-icon launch-marker-enter',
        html: '<span class="landing-map-dot"></span>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
}

function updateLaunchSiteZoomDisplay() {
    if (!map) return;
    var zoom = map.getZoom();
    var visualKind = zoom < 4 ? 'point' : 'site';
    allLaunchSiteGroups.forEach(function(group) {
        if (group && typeof group.eachLayer === 'function' && group._launchVisualKind !== visualKind) {
            var icon = createLaunchSiteIcon(visualKind);
            group.eachLayer(function(marker) { marker.setIcon(icon); });
            group._launchVisualKind = visualKind;
        }
        var isForeign = !!group._isForeignLaunchSite;
        if (isForeign && zoom >= 13) {
            if (map.hasLayer(group)) map.removeLayer(group);
            var markerIndex = launchSiteMarkers.indexOf(group);
            if (markerIndex >= 0) launchSiteMarkers.splice(markerIndex, 1);
        } else if (isForeign && zoom < 13) {
            if (!map.hasLayer(group)) group.addTo(map);
            if (!launchSiteMarkers.includes(group)) launchSiteMarkers.push(group);
        }
    });
    var landingKind = zoom < 4 ? 'point' : 'site';
    landingZoneMarkers.forEach(function(group) {
        if (!group || typeof group.eachLayer !== 'function') return;
        if (group._showOnlyAtZoom13) {
            if (zoom >= 13) {
                if (!map.hasLayer(group)) group.addTo(map);
            } else if (map.hasLayer(group)) {
                map.removeLayer(group);
            }
        }
        if (group._landingVisualKind !== landingKind) {
            var icon = landingKind === 'point'
                ? createLandingZonePointIcon()
                : L.icon({ iconUrl: group._landingIconUrl, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -40], className: 'launch-marker-enter' });
            group.eachLayer(function(marker) { marker.setIcon(icon); });
            group._landingVisualKind = landingKind;
        }
    });
    // 四级只显示境外工位；国内发射场保持三级样式，国内工位不展开。
    launchPadMarkers.forEach(function(group) {
        if (!group) return;
        if (zoom >= 13 && group._isForeignLaunchPad) group.addTo(map);
        else map.removeLayer(group);
    });
}

function initializeLaunchPadMarkers() {
    launchPadMarkers = launchPadData.map(function(pad) {
        if (!Number.isFinite(pad.lat) || !Number.isFinite(pad.lng)) {
            console.warn('[工位标记] 缺少有效坐标，已跳过:', pad.name);
            return null;
        }
        var popup = '<b>' + (pad.name || '未命名工位') + '</b>' +
            (pad.siteName ? '<br>所属发射场：' + pad.siteName : '') +
            (pad.content ? '<br>' + pad.content : '');
        // 工位暂时与发射场统一使用 statics/launch.png，避免使用未定义的专属图标。
        var group = createWrappedMarkerGroup(pad.lat, pad.lng, createLaunchSiteIcon('site'), popup);
        group._isForeignLaunchPad = true;
        if (map.getZoom() >= 13) group.addTo(map);
        return group;
    }).filter(Boolean);
}

function drawLandingZone(lat, lng, title, content, iconUrl, showOnlyAtZoom13){
    var pointMode = map.getZoom() < 4;
    var icon = pointMode ? createLandingZonePointIcon() : L.icon({
        iconUrl: iconUrl,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -40]
    });

    var markerGroup = createWrappedMarkerGroup(lat, lng, icon, content);
    markerGroup._landingIconUrl = iconUrl;
    markerGroup._landingVisualKind = pointMode ? 'point' : 'site';
    markerGroup._showOnlyAtZoom13 = !!showOnlyAtZoom13;
    if (!markerGroup._showOnlyAtZoom13 || map.getZoom() >= 13) markerGroup.addTo(map);
    landingZoneMarkers.push(markerGroup);
}

function drawForeignLaunchSites() {
    const foreignSiteIcon = 'statics/launch.png';
    const foreignSites = [
        {
            name: '卡纳维拉尔角太空军基地',
            lat: 28.488889,
            lng: -80.577778,
            content: "<b><large>美国佛罗里达</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/卡纳维拉尔角太空军站' target='_blank' style='text-decoration: none; font-weight: bold;'>卡纳维拉尔角太空军基地</a>（Cape Canaveral Space Force Station，CCSFS）</b>，简称“卡角”，原称卡纳维拉尔角空军基地，1949 年启用，是美国东海岸的主要发射基地，现有空间发射综合体 37B、40、41 三个发射台，与肯尼迪航天中心相邻。"
        },
        {
            name: '圭亚那航天中心',
            lat: 5.28,
            lng: -52.79,
            content: "<b><large>法属圭亚那库鲁</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/圭亚那航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>圭亚那航天中心</a>（Guiana Space Centre，CSG；法语：Centre Spatial Guyanais）</b>，位于南美洲法属圭亚那库鲁西北部，1964 年建立、1968 年开始运作，由欧洲空间局、法国国家空间研究中心和阿丽亚娜空间公司共同使用。"
        },
        {
            name: '安多亚太空港',
            lat: 69.108266,
            lng: 15.590872,
            content: "<b><large>挪威安多亚岛</large></b><br><b><a href='https://sat.huijiwiki.com/wiki/安多亚太空港' target='_blank' rel='noopener' style='text-decoration: none; font-weight: bold;'>安多亚太空港</a>（Andøya Spaceport）</b>位于挪威北部安多亚岛，Isar Aerospace 于此运营 Spectrum 轨道火箭发射。高纬度与面向海洋的发射方向适合极轨和太阳同步轨道任务；2026 年 9 月完成欧洲大陆首次成功的轨道卫星发射。<br><a href='https://andoyaspace.no/news-articles/vi-er-stolte-av-a-ha-bidratt-til-a-skape-historie/' target='_blank' rel='noopener'>Andøya Space：发射近况</a>"
        },
        {
            name: '鲍文轨道航天港',
            lat: -19.957920,
            lng: 148.113022,
            content: "<b><large>澳大利亚昆士兰州鲍文</large></b><br><b><a href='https://sat.huijiwiki.com/wiki/鲍文轨道航天港' target='_blank' rel='noopener' style='text-decoration: none; font-weight: bold;'>鲍文轨道航天港</a>（Bowen Orbital Spaceport）</b>是澳大利亚首个获得实施轨道发射活动许可的商业发射场。"
        },
        {
            name: '拜科努尔航天发射场',
            lat: 46.039600,
            lng: 63.031647,
            content: "<b><large>哈萨克斯坦拜科努尔</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/拜科努尔航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>拜科努尔航天发射场</a>（Baikonur Cosmodrome）</b>，位于哈萨克斯坦南部，1955 年建立，是世界上第一个轨道与载人航天发射场，目前由俄罗斯租借至 2050 年，俄罗斯多数卫星和所有载人飞船都在此发射。"
        },
        {
            name: '普列谢茨克航天发射场',
            lat: 62.927918,
            lng: 40.574809,
            content: "<b><large>俄罗斯阿尔汉格尔斯克</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/普列谢茨克航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>普列谢茨克航天发射场</a>（Plesetsk Cosmodrome）</b>，位于阿尔汉格尔斯克州米尔内，1957 年建立，最初是 R-7 洲际弹道导弹基地；因纬度较高，适合闪电轨道、高倾角近地轨道与太阳同步轨道发射。"
        },
        {
            name: '东方航天发射场',
            lat: 51.884174,
            lng: 128.334872,
            content: "<b><large>俄罗斯阿穆尔</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/东方航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>东方航天发射场</a>（Vostochny Cosmodrome）</b>，又称沃斯托克尼航天发射场，位于远东阿穆尔州，2016 年 4 月 28 日首次发射，用于降低俄罗斯对拜科努尔航天发射场的依赖。"
        },
        {
            name: '火箭实验室发射综合体1号',
            lat: -39.261142,
            lng: 177.8651065,
            content: "<b><large>新西兰马希亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/火箭实验室发射综合体1号' target='_blank' style='text-decoration: none; font-weight: bold;'>火箭实验室发射综合体1号</a>（Rocket Lab Launch Complex 1）</b>，又称马希亚发射综合体，位于新西兰北岛马希亚半岛南端的阿胡里点，由火箭实验室拥有并运营；2017 年 5 月 25 日发射电子号，成为第一个执行轨道发射的私人发射场。"
        },
        {
            name: '种子岛航天中心',
            lat: 30.4009585,
            lng: 130.976561,
            content: "<b><large>日本鹿儿岛</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/种子岛航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>种子岛航天中心</a>（Tanegashima Space Center，TNSC）</b>，位于九州以南约 40 公里的种子岛东南海岸，总面积约 9.7 平方公里，1969 年建立，是日本最大的火箭发射基地，现由日本宇宙航空研究开发机构管理。"
        },
        {
            name: '罗老航天中心',
            lat: 34.431847,
            lng: 127.535189,
            content: "<b><large>韩国全罗南道</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/罗老航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>罗老航天中心</a>（Naro Space Center）</b>，位于全罗南道高兴郡，2009 年 7 月启用，由国有的韩国航空航天研究院运营，设有两座发射台、控制塔以及火箭总装与测试设施。"
        },
        {
            name: '肯尼迪航天中心',
            lat: 28.524167,
            lng: -80.650833,
            content: "<b><large>美国佛罗里达</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/肯尼迪航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>肯尼迪航天中心</a>（Kennedy Space Center，KSC）</b>，位于佛罗里达州东海岸的梅里特岛，1962 年 7 月成立，是美国国家航空航天局主要的航天发射场，自阿波罗 4 号起一直承担 NASA 载人航天任务的发射。"
        },
        {
            name: '范登堡空军基地',
            lat: 34.732778,
            lng: -120.568056,
            content: "<b><large>美国加利福尼亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/范登堡太空军基地' target='_blank' style='text-decoration: none; font-weight: bold;'>范登堡空军基地</a>（Vandenberg Space Force Base，VSFB，现称范登堡太空军基地）</b>，位于加州隆坡西北约 15 公里，1941 年建立，由美国太空军第 30 太空发射三角洲部队运营，主要执行极轨卫星发射与导弹试验。"
        },
        {
            name: '萨迪什·达万航天中心',
            lat: 13.719939,
            lng: 80.230425,
            content: "<b><large>印度安得拉邦</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/萨迪什·达万航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>萨迪什·达万航天中心</a>（Satish Dhawan Space Centre，SDSC）</b>，又称斯里赫里戈达靶场（SHAR），位于安得拉邦斯里赫里戈达岛，由印度空间研究组织运营，2002 年改为以 ISRO 前主席萨迪什·达万命名。"
        },
        {
            name: '西海卫星发射场',
            lat: 39.656357,
            lng: 124.720842,
            content: "<b><large>朝鲜东仓里</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/西海卫星发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>西海卫星发射场</a>（Sohae Satellite Launching Station）</b>，又称东仓洞航天发射中心，位于朝鲜西北部靠近中国边界的丘陵地带，2012 年 4 月首次发射光明星 3 号失败，同年 12 月发射成功。"
        },
        {
            name: '星港',
            lat: 25.997,
            lng: -97.157,
            content: "<b><large>美国得克萨斯</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/星港' target='_blank' style='text-decoration: none; font-weight: bold;'>星港</a>（Starbase，又称星际基地、博卡奇卡发射场）</b>，位于得克萨斯州博卡奇卡村附近，隶属太空探索技术公司，是星舰的专属发射场；2025 年 5 月当地成立星港市。"
        },
        {
            name: '帕尔马希姆空军基地',
            lat: 31.897778,
            lng: 34.690556,
            content: "<b><large>以色列帕尔马希姆</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/帕尔马希姆空军基地' target='_blank' style='text-decoration: none; font-weight: bold;'>帕尔马希姆空军基地</a>（Palmachim Airbase）</b>，位于地中海沿岸的以色列军事设施与航天发射场，1988 年启用，以附近的棕榈农场命名。"
        },
        {
            name: '中大西洋区域发射场',
            lat: 37.832883,
            lng: -75.488912,
            content: "<b><large>美国弗吉尼亚</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/中大西洋区域发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>中大西洋区域发射场</a>（Mid-Atlantic Regional Spaceport，MARS）</b>，位于弗吉尼亚州沃洛普斯岛南端，隶属于沃洛普斯飞行设施，2006 年启用的商业航天发射设施。"
        },
        {
            name: '塞姆南航天中心',
            lat: 35.234444,
            lng: 53.911111,
            content: "<b><large>伊朗塞姆南</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/塞姆南航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>塞姆南航天中心</a>（Semnan Space Center）</b>，位于塞姆南市东南约 50 公里，2009 年启用，是伊朗主要的航天发射场。"
        },
        {
            name: '沙赫鲁德导弹测试场',
            lat: 36.200577,
            lng: 55.333922,
            content: "<b><large>伊朗塞姆南省沙赫鲁德</large></b><br><b><a href='https://sat.huijiwiki.com/wiki/沙赫鲁德导弹测试场' target='_blank' rel='noopener' style='text-decoration: none; font-weight: bold;'>沙赫鲁德导弹测试场</a>（Shahroud Missile Test Site）</b>位于德黑兰东北约 370 千米，约于 1998 年启用，是伊朗重要的固体燃料弹道导弹与军用卫星试验、发射基地，由伊斯兰革命卫队航空航天部队管辖。"
        },
        {
            name: '阿尔坎塔拉航天中心',
            lat: -2.317641,
            lng: -44.368004,
            content: "<b><large>巴西马拉尼昂</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/阿尔坎塔拉航天中心' target='_blank' style='text-decoration: none; font-weight: bold;'>阿尔坎塔拉航天中心</a>（Alcantara Space Center）</b>，位于巴西马拉尼昂州阿尔坎塔拉半岛，1982 年启用，是巴西重要的航天发射中心；该标记按要求放在 INNOSPACE 商业发射台坐标。"
        },
        {
            name: '纪伊太空发射场',
            lat: 33.544263,
            lng: 135.889436,
            content: "<b><large>日本和歌山</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/纪伊太空发射场' target='_blank' rel='noopener' style='text-decoration: none; font-weight: bold;'>纪伊太空发射场</a>（Space Port Kii）</b>，位于和歌山县串本町，是 Space One 运营的民营火箭发射场。"
        },
        {
            name: '内之浦航天中心',
            lat: 31.251006,
            lng: 131.082024,
            content: "<b><large>日本鹿儿岛</large></b><br>" +
                "<b><a href='https://sat.huijiwiki.com/wiki/内之浦航天中心' target='_blank' rel='noopener' style='text-decoration: none; font-weight: bold;'>内之浦航天中心</a>（Uchinoura Space Center，USC）</b>位于鹿儿岛县肝付町。这里曾承担日本多数科学卫星发射任务，现继续用于亚轨道与 Epsilon 火箭发射，并设有深空探测通信设施。"
        }
    ].map(site => ({
        ...site,
        icon: foreignSiteIcon,
    }));

    foreignSites.forEach(site => {
        if (!Number.isFinite(site.lat) || !Number.isFinite(site.lng)) {
            console.warn('海外发射场缺少坐标，已跳过:', site.name);
            return;
        }

        drawLaunchsite(site.lat, site.lng, site.name, site.content, site.icon, true);
    });
}

function createWrappedMarkerGroup(lat, lng, icon, popupContent) {
    const markers = WRAP_WORLD_OFFSETS.map(offset => {
        const marker = L.marker([lat, lng + offset], { icon: icon });
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'launch-site-popup'
        });
        return marker;
    });

    return L.layerGroup(markers);
}

// 初始化海南发射场标记
function initHainanSites(sites) {
    const wenchang = sites.find(s => s.name === '文昌航天发射场');
    const commercial = sites.find(s => s.name === '海南商业航天发射场');
    
    if (!wenchang || !commercial) return;
    
    // 计算两个发射场的中心点
    const centerLat = (wenchang.lat + commercial.lat) / 2;
    const centerLng = (wenchang.lng + commercial.lng) / 2;
    
    // 创建合并后的标记（低缩放级别显示）
    const mergedContent = "<b><large>海南文昌</large></b><br>" +
        "<b><a href='https://baike.baidu.com/item/文昌航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>文昌航天发射场</a>" +
        "（Wenchang Spacecraft Launch Site, WSLS）</b>位于中国海南省文昌市，是中国首座滨海航天发射场，也是世界现有的少数低纬度航天发射场之一。<br><br>" +
        "<b><a href='https://baike.baidu.com/item/海南商业航天发射场' target='_blank' style='text-decoration: none; font-weight: bold;'>海南商业航天发射场</a>（Hainan Commercial Spacecraft Launch Site）</b>，" +
        "是我国首个开工建设的商业航天发射场，由海南国际商业航天发射有限公司投建，致力于打造国际一流、市场化运营的航天发射场，进一步提升我国民商运载火箭发射能力。";
    
    hainanMergedMarker = createWrappedMarkerGroup(centerLat, centerLng, createLaunchSiteIcon('site'), mergedContent);
    hainanMergedMarker._launchSiteLatLng = [centerLat, centerLng];
    allLaunchSiteGroups.push(hainanMergedMarker);
    
    // 创建分离的标记（高缩放级别显示）
    const wenchangMarker = createWrappedMarkerGroup(wenchang.lat, wenchang.lng, createLaunchSiteIcon('site'), wenchang.content);
    wenchangMarker._launchSiteLatLng = [wenchang.lat, wenchang.lng];
    allLaunchSiteGroups.push(wenchangMarker);
    const commercialMarker = createWrappedMarkerGroup(commercial.lat, commercial.lng, createLaunchSiteIcon('site'), commercial.content);
    commercialMarker._launchSiteLatLng = [commercial.lat, commercial.lng];
    allLaunchSiteGroups.push(commercialMarker);
    
    hainanSeparateMarkers = [wenchangMarker, commercialMarker];
    
    // 根据当前缩放级别决定显示哪个
    updateHainanSitesDisplay(sites);
}

// 根据缩放级别更新海南发射场的显示状态
function updateHainanSitesDisplay(sites) {
    const currentZoom = map.getZoom();
    const ZOOM_THRESHOLD = 10; // zoom >= 10 时海南两个发射场分开显示
    
    if (currentZoom >= ZOOM_THRESHOLD) {
        // 高缩放级别：分开显示
        if (hainanMergedMarker && map.hasLayer(hainanMergedMarker)) {
            map.removeLayer(hainanMergedMarker);
        }
        hainanSeparateMarkers.forEach(marker => {
            if (!map.hasLayer(marker)) {
                marker.addTo(map);
                launchSiteMarkers.push(marker);
            }
        });
    } else {
        // 低缩放级别：合并显示
        hainanSeparateMarkers.forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
                // 从 launchSiteMarkers 中移除
                const idx = launchSiteMarkers.indexOf(marker);
                if (idx > -1) {
                    launchSiteMarkers.splice(idx, 1);
                }
            }
        });
        if (hainanMergedMarker && !map.hasLayer(hainanMergedMarker)) {
            hainanMergedMarker.addTo(map);
            if (!launchSiteMarkers.includes(hainanMergedMarker)) {
                launchSiteMarkers.push(hainanMergedMarker);
            }
        }
    }
    updateLaunchSiteZoomDisplay();
}

// 高亮NOTAM
function highlightNotam(index, color) {
    removeHighlight();
    if (!dict || index >= dict.NUM) return;
    try {
        const style = { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.6 };
        highlightPolygon = geometryToLayer(dict.GEOMETRY?.[index] || '', style);
        if (highlightPolygon) highlightPolygon.addTo(map);
    } catch (error) {
        console.error('高亮绘制失败', error);
    }
}
// 移除高亮
function removeHighlight() {
    if (highlightPolygon) {
        map.removeLayer(highlightPolygon);
        highlightPolygon = null;
    }
}

// 解析坐标为Leaflet点
function parseCoordinatesToPoints(coordStr) {
    const arr = String(coordStr || '').split('-');
    const points = [];

    for (let i = 0; i < arr.length; i++) {
        const coord = pullOut(arr[i]);
        if (coord) {
            points.push([coord[1], coord[0]]); // Leaflet使用 [lat, lng]
        }
    }

    return points;
}

function parseCircleCenter(center) {
    const point = pullOut(String(center || ''));
    return point && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [point[1], point[0]] : null;
}

function circleRadiusMeters(radius, unit) {
    const value = Number(radius);
    return Number.isFinite(value) && value > 0 ? value * (String(unit || '').toUpperCase() === 'NM' ? 1852 : 1000) : 0;
}

function formatCircleCoordinates(center, radius, unit) {
    return String(center || '') + ' RADIUS ' + String(radius || '') + String(unit || '').toUpperCase();
}

// Keep circles continuous on the horizontally wrapped map, just like polygons.
// The small compatibility surface lets existing sidebar/highlight code treat the
// resulting FeatureGroup as a normal vector layer.
function createWrappedCircle(center, radiusMeters, options) {
    const normalizedLng = normalizeLngForWrap(center[1]);
    const circles = WRAP_WORLD_OFFSETS.map(offset => L.circle([center[0], normalizedLng + offset], { ...options, radius: radiusMeters }));
    const group = L.featureGroup(circles);
    group.options = { ...options, radius: radiusMeters };
    group.__baseStyle = { ...group.options };
    group.setStyle = function(style) { circles.forEach(circle => circle.setStyle(style)); return group; };
    group.bringToFront = function() { circles.forEach(circle => circle.bringToFront()); return group; };
    group.bindPopup = function(content, popupOptions) { circles.forEach(circle => circle.bindPopup(content, popupOptions)); return group; };
    group.getBounds = function() { return circles[Math.floor(circles.length / 2)].getBounds(); };
    group.__circleCenter = L.latLng(center[0], normalizedLng);
    group.__circleRadius = radiusMeters;
    return group;
}

function normalizeLngForWrap(lng) {
    let value = Number(lng);
    if (!Number.isFinite(value)) return lng;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
}

function unwrapLatLngs(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
    const output = [[latlngs[0][0], normalizeLngForWrap(latlngs[0][1])]];
    for (let index = 1; index < latlngs.length; index++) {
        let longitude = normalizeLngForWrap(latlngs[index][1]);
        const previous = output[output.length - 1][1];
        while (longitude - previous > 180) longitude -= 360;
        while (longitude - previous < -180) longitude += 360;
        output.push([latlngs[index][0], longitude]);
    }
    return output;
}

function buildWrappedLatLngRings(latlngs) {
    const continuous = unwrapLatLngs(latlngs);
    if (continuous.length < 3) return [];
    return WRAP_WORLD_OFFSETS.map(offset => continuous.map(([lat, lng]) => [lat, lng + offset]));
}

// 与 createWrappedCircle 同理：多世界副本会让 getBounds() 覆盖 ±3600°，
// 使侧边栏定位、导出图等 fitBounds 的缩放被压到最小级别，因此固定返回原始（未偏移）范围。
function createWrappedPolygon(points, options) {
    const rings = buildWrappedLatLngRings(points);
    if (rings.length === 0) return null;
    const polygon = L.polygon(rings, options);
    const baseRing = rings[Math.floor(rings.length / 2)];
    polygon.__baseLatLngs = baseRing;
    polygon.getBounds = function() { return L.latLngBounds(baseRing); };
    return polygon;
}

function geometryCoordinate(value) {
    return parseCircleCenter(String(value || ''));
}

function geometryRadiusMeters(value) {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)(KM|NM)$/i);
    return match ? circleRadiusMeters(match[1], match[2]) : 0;
}

function initialBearingDegrees(from, to) {
    const rad = Math.PI / 180;
    const lat1 = from[0] * rad, lat2 = to[0] * rad;
    const deltaLng = (to[1] - from[1]) * rad;
    const y = Math.sin(deltaLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
    return (Math.atan2(y, x) / rad + 360) % 360;
}

function destinationPoint(center, bearing, meters) {
    const rad = Math.PI / 180, earth = 6371008.8;
    const distance = meters / earth, direction = bearing * rad;
    const lat1 = center[0] * rad, lng1 = center[1] * rad;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(direction));
    const lng2 = lng1 + Math.atan2(Math.sin(direction) * Math.sin(distance) * Math.cos(lat1), Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 / rad, lng2 / rad];
}

function appendArc(points, center, radius, end, direction) {
    if (!points.length || !center || !radius || !end) return false;
    const start = points[points.length - 1];
    const startBearing = initialBearingDegrees(center, start);
    const endBearing = initialBearingDegrees(center, end);
    let sweep = direction === 'CCW' ? (startBearing - endBearing + 360) % 360 : (endBearing - startBearing + 360) % 360;
    if (sweep === 0) sweep = 360;
    const steps = Math.max(1, Math.ceil(sweep / 2));
    for (let step = 1; step <= steps; step++) {
        const bearing = direction === 'CCW' ? startBearing - sweep * step / steps : startBearing + sweep * step / steps;
        points.push(destinationPoint(center, bearing, radius));
    }
    return true;
}

function geometryToLayer(geometry, options) {
    const parts = String(geometry || '').split('|');
    if (!parts[0]) return null;
    const kind = parts.shift().toUpperCase();
    if (kind === 'CIRCLE') {
        const center = geometryCoordinate((parts.find(part => part.startsWith('C=')) || '').slice(2));
        const radius = geometryRadiusMeters((parts.find(part => part.startsWith('R=')) || '').slice(2));
        return center && radius ? createWrappedCircle(center, radius, options) : null;
    }
    if (kind === 'SECTOR') {
        const center = geometryCoordinate((parts.find(part => part.startsWith('C=')) || '').slice(2));
        const radius = geometryRadiusMeters((parts.find(part => part.startsWith('R=')) || '').slice(2));
        const bearings = ((parts.find(part => part.startsWith('B=')) || '').slice(2)).split(',').map(Number);
        const direction = ((parts.find(part => part.startsWith('D=')) || '').slice(2)).toUpperCase() || 'CW';
        if (!center || !radius || bearings.length !== 2 || !bearings.every(Number.isFinite)) return null;
        const points = [center, destinationPoint(center, bearings[0], radius)];
        appendArc(points, center, radius, destinationPoint(center, bearings[1], radius), direction);
        points.push(center);
        return createWrappedPolygon(points, options);
    }
    if (kind === 'POINT') {
        const center = geometryCoordinate((parts.find(part => part.startsWith('C=')) || '').slice(2));
        return center ? L.circleMarker(center, Object.assign({ radius: 7 }, options)) : null;
    }
    if (kind === 'LINE') {
        const points = [];
        for (const part of parts) {
            if (!part.startsWith('M=') && !part.startsWith('L=')) continue;
            const point = geometryCoordinate(part.slice(2));
            if (!point) return null;
            points.push(point);
        }
        return points.length >= 2 ? L.polyline(points, options) : null;
    }
    if (kind !== 'PATH') return null;
    const points = [];
    for (const part of parts) {
        if (part.startsWith('M=') || part.startsWith('L=')) {
            const point = geometryCoordinate(part.slice(2));
            if (!point) return null;
            points.push(point);
        } else if (part.startsWith('A=')) {
            const values = Object.fromEntries(part.slice(2).split(',').map(item => item.split(':', 2)));
            const center = geometryCoordinate(values.C), end = geometryCoordinate(values.E);
            if (!appendArc(points, center, geometryRadiusMeters(values.R), end, String(values.D || 'CW').toUpperCase())) return null;
        }
    }
    return points.length >= 3 ? createWrappedPolygon(points, options) : null;
}

window.buildWrappedLatLngRings = buildWrappedLatLngRings;
window.geometryToLayer = geometryToLayer;

/* 拼接 E) 段的相邻两行：源报文既可能在单词中间硬折行（例如 "...BAC" + "K TO START"）
   也可能是自然换行。规则：
   - 行尾与行首都带空白 → 去掉行首空白直接接上（避免出现双空格）
   - 只有一侧带空白 → 直接接上（保留原有空白，不重复补空格）
   - 两侧都是字母/数字 → 判定为单词中间的硬折行 → 直接接上（BAC + K → BACK）
   - 其它情况 → 补一个空格（"...BY:" + "N3958..." → "...BY: N3958..."） */
function joinNotamLines(previous, line) {
    if (!previous) return line;
    if (!line) return previous;
    const last = previous.slice(-1);
    const first = line.slice(0, 1);
    if (/\s/.test(last) && /\s/.test(first)) return previous + line.replace(/^\s+/, '');
    if (/\s/.test(last) || /\s/.test(first)) return previous + line;
    if (/[0-9A-Za-z]/.test(last) && /[0-9A-Za-z]/.test(first)) return previous + line;
    return previous + ' ' + line;
}

/* 从原始报文中取出 E) 段正文：默认取全部行（maxLines <= 0 表示不限行数、不出现省略号），
   传入正数则最多显示该行数、多出的用 ... 省略。行内容保留原始空白，返回纯文本（不带末尾换行）。 */
function extractNotamDetails(rawMessage, maxLines = 0) {
    const text = String(rawMessage || '').replace(/\r/g, '');
    const match = text.match(/(?:^|\n)\s*E\)\s*([\s\S]*?)(?=\s[A-H]\)|$)/);
    if (!match) return '';
    // 不做 trim：行首/行尾的空白是硬折行的边界信息，拼接时要保留
    const lines = match[1].split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return '';
    const shown = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    return shown.join('\n') + (shown.length < lines.length ? '...' : '');
}

function extractFullNotamDetails(rawMessage, maxLines = 0) {
    const lines = String(rawMessage == null ? '' : rawMessage)
        .replace(/\r/g, '')
        .split('\n')
        .filter(line => line.trim() !== '');
    if (lines.length === 0) return '';
    const shown = maxLines > 0 ? lines.slice(0, maxLines) : lines;
    return shown.join('\n') + (shown.length < lines.length ? '...' : '');
}

function escapeNotamText(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 详情末尾的断行：HTML 里换行必须用 <br>；而且行尾**单个** <br> 不会渲染出空行
   （末尾的空行盒高度为 0），要「最后一行是空行」必须连续两次断行。 */
const NOTAM_DETAIL_TRAILING_BREAK = '<br><br>';

function notamDetailHtml(rawMessage, maxLines = 0) {
    const details = extractNotamDetails(rawMessage, maxLines);
    if (details) {
        const text = details.split('\n').reduce((accumulated, line) => joinNotamLines(accumulated, line), '');
        if (!text) return '';
        return escapeNotamText(text) + NOTAM_DETAIL_TRAILING_BREAK;
    }
    const full = extractFullNotamDetails(rawMessage, maxLines);
    if (!full) return '';
    return escapeNotamText(full).replace(/\n/g, '<br>') + NOTAM_DETAIL_TRAILING_BREAK;
}

/* 弹窗标题栏：左侧标题 + 右侧「隐藏 / 图钉 / 复制 / 关闭」；隐藏需二次确认。 */
const POPUP_PIN_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z'/></svg>";
const POPUP_COPY_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'/></svg>";
const POPUP_CLOSE_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='currentColor' d='M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'/></svg>";
const POPUP_HIDE_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 3l18 18'/></svg>";
const POPUP_RAW_ICON = "<svg width='14' height='14' viewBox='0 0 24 24' aria-hidden='true'>" +
    "<path fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' d='M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8'/></svg>";

let popupRawSeq = 0;
const popupRawMessages = new Map();

function registerPopupRawMessage(rawMessage) {
    const key = 'raw-' + (++popupRawSeq);
    popupRawMessages.set(key, String(rawMessage == null ? '' : rawMessage));
    return key;
}

function popupRawMessage(key) {
    return popupRawMessages.get(key) || '';
}

function buildNotamPopupHeader(title, rawMessage, headerStyle, notamIndex) {
    const key = registerPopupRawMessage(rawMessage);
    const styleAttr = headerStyle ? " style='" + headerStyle + "'" : '';
    const hideButton = Number.isInteger(notamIndex) && notamIndex >= 0
        ? "<button class='popup-hide' data-notam-index='" + notamIndex + "' data-confirming='false' title='隐藏航警' aria-label='隐藏航警'>" +
            "<span class='popup-hide-icon'>" + POPUP_HIDE_ICON + "</span>" +
            "<span class='popup-hide-label' aria-hidden='true'>确认</span>" +
          "</button>"
        : '';
    return "<div class='notam-popup-header'" + styleAttr + ">" +
        "<h4>" + title + "</h4>" +
        "<div class='popup-header-actions'>" +
        "<button class='popup-toggle-raw' data-raw-key='" + key + "' data-raw-view='false' title='查看航警原文' aria-label='查看航警原文'>" + POPUP_RAW_ICON + "</button>" +
        hideButton +
        "<button class='popup-pin' data-pinned='false' title='固定弹窗' aria-label='固定弹窗'>" + POPUP_PIN_ICON + "</button>" +
        "<button class='popup-copy-raw' data-raw-key='" + key + "' title='复制原始报文' aria-label='复制原始报文'>" + POPUP_COPY_ICON + "</button>" +
        "</div>" +
        "</div>";
}

/* 与侧边栏眼睛按钮一致：只从地图隐藏，原始数据和侧边栏条目仍保留。 */
function hideAutoNotamFromPopup(index) {
    if (!Number.isInteger(index) || index < 0 || !polygonAuto[index]) return false;
    visibleState[index] = false;
    if (map && typeof map.removeLayer === 'function') map.removeLayer(polygonAuto[index]);
    if (typeof updateSidebar === 'function') updateSidebar();
    if (window.NotamGlobe) window.NotamGlobe.refresh(true);
    return true;
}

function setPopupHideConfirmation(button, confirming) {
    if (!button) return;
    button.dataset.confirming = confirming ? 'true' : 'false';
    const label = confirming ? '确认' : '隐藏航警';
    button.title = label;
    button.setAttribute('aria-label', label);
}

function setPopupRawView(container, owner, rawView, button) {
    if (!container || !container.querySelector) return;
    if (owner) owner.__rawView = !!rawView;
    const body = container.querySelector('.notam-popup-body');
    const structured = container.querySelector('.popup-structured-view');
    const raw = container.querySelector('.popup-raw-view');
    if (!body || !structured || !raw) return;
    if (rawView && !owner.__rawBodyHeight) {
        owner.__rawBodyHeight = Math.ceil(body.getBoundingClientRect().height);
    }
    if (owner.__rawBodyHeight) body.style.height = owner.__rawBodyHeight + 'px';
    structured.hidden = !!rawView;
    raw.hidden = !rawView;
    const toggle = button || container.querySelector('.popup-toggle-raw');
    if (toggle) {
        toggle.dataset.rawView = rawView ? 'true' : 'false';
        toggle.title = rawView ? '显示结构化信息' : '查看航警原文';
        toggle.setAttribute('aria-label', toggle.title);
    }
}

function togglePopupRawView(popup, button) {
    if (!popup || !popup.getElement) return;
    const container = popup.getElement();
    const current = button && button.dataset.rawView === 'true';
    setPopupRawView(container, popup, !current, button);
}
window.setPopupRawView = setPopupRawView;

/* 展开确认后，点击弹窗其它位置、地图或任意其它控件都会收起，避免确认状态残留。 */
function bindPopupHideCollapse(popup, container) {
    if (!popup || !container || typeof document === 'undefined') return;
    if (popup.__hideCollapseHandler) document.removeEventListener('click', popup.__hideCollapseHandler);
    popup.__hideCollapseHandler = function(event) {
        const button = container.querySelector ? container.querySelector('.popup-hide[data-confirming="true"]') : null;
        const target = event && event.target;
        if (!button || !target || typeof target.closest !== 'function') return;
        if (target.closest('.popup-hide') === button) return;
        setPopupHideConfirmation(button, false);
    };
    document.addEventListener('click', popup.__hideCollapseHandler);
}

/* 固定状态记在 popup 对象上：Leaflet 重新定位（点击同一多边形）会执行
   update() → _updateContent()，按原始字符串重写弹窗正文，按钮 DOM 会被重建，
   所以状态不能只存在按钮上；点击事件也改用容器委托，重建后依然有效。
   Leaflet 侧还需要同步两处：getEvents() 的 closeOnClick（点击地图关闭）、
   openOn() 的 autoClose（被新弹窗顶掉）。 */
function setPopupPinned(popup, pinned) {
    if (!popup || !popup.options) return;
    popup.__pinned = !!pinned;
    popup.options.closeOnClick = !pinned;
    popup.options.autoClose = !pinned;
    const map = popup._map || popup.__pinMap;
    if (map && typeof map.off === 'function') {
        popup.__pinMap = map;
        map.off('preclick', popup.close, popup);
        if (!pinned) map.on('preclick', popup.close, popup);
    }
    applyPopupPinState(popup);
}

/* 把固定状态套用到（可能刚被重建的）图钉按钮上 */
function applyPopupPinState(popup, container) {
    if (!popup) return;
    const element = container || (popup.getElement ? popup.getElement() : null);
    const button = element && element.querySelector ? element.querySelector('.popup-pin') : null;
    if (!button) return;
    const pinned = popup.__pinned === true;
    button.dataset.pinned = pinned ? 'true' : 'false';
    button.title = pinned ? '已固定：点击地图或打开其它航警都不会关闭' : '固定弹窗';
}

/* 容器级事件委托 + 内容重写后重新套用状态 */
function ensurePopupActionDelegation(container, popup) {
    if (!container || !popup) return;
    if (!container.__popupActionsBound && typeof container.addEventListener === 'function') {
        container.__popupActionsBound = true;
        container.addEventListener('click', function(event) {
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            if (target.closest('.popup-pin')) {
                event.stopPropagation();
                setPopupPinned(popup, popup.__pinned !== true);
                return;
            }
            const rawButton = target.closest('.popup-toggle-raw[data-raw-key]');
            if (rawButton) {
                event.stopPropagation();
                togglePopupRawView(popup, rawButton);
                return;
            }
            const hideButton = target.closest('.popup-hide[data-notam-index]');
            if (hideButton) {
                event.stopPropagation();
                if (hideButton.dataset.confirming !== 'true') {
                    setPopupHideConfirmation(hideButton, true);
                    return;
                }
                if (hideAutoNotamFromPopup(Number(hideButton.getAttribute('data-notam-index')))) {
                    popup.close();
                }
                return;
            }
            const copyButton = target.closest('.popup-copy-raw[data-raw-key]');
            if (copyButton) {
                event.stopPropagation();
                handleCopy(popupRawMessage(copyButton.getAttribute('data-raw-key')));
            }
        });
        bindPopupHideCollapse(popup, container);
    }
    if (typeof popup._updateContent === 'function' && !popup.__pinContentPatched) {
        popup.__pinContentPatched = true;
        const originalUpdateContent = popup._updateContent;
        popup._updateContent = function() {
            const element = this.getElement ? this.getElement() : null;
            const closeButton = element && element.querySelector ? element.querySelector('a.leaflet-popup-close-button') : null;
            if (closeButton && element && closeButton.parentElement !== element) element.appendChild(closeButton);
            originalUpdateContent.apply(this, arguments);
            applyPopupPinState(this, container);
            setPopupRawView(container, this, this.__rawView === true);
            applyPopupCloseIcon(this);
            movePopupCloseIntoHeader(this, container);
        };
    }
}

/* Leaflet 的关闭按钮是 <a aria-label="Close popup"><span>×</span></a>，只在 _initLayout 里创建一次，
   重写弹窗正文不会重建它，所以这里一次性换成与图钉/复制同一套 14×14 图标；
   万一没换成，按钮里仍是原来的 ×，不会变成空按钮。 */
function applyPopupCloseIcon(popup) {
    const element = popup && popup.getElement ? popup.getElement() : null;
    const button = element && element.querySelector ? element.querySelector('a.leaflet-popup-close-button') : null;
    if (!button || typeof button.innerHTML !== 'string' || button.innerHTML.indexOf('<svg') !== -1) return;
    button.innerHTML = POPUP_CLOSE_ICON;
}

function movePopupCloseIntoHeader(popup, container) {
    const element = container || (popup && popup.getElement ? popup.getElement() : null);
    if (!element || !element.querySelector) return;
    const closeButton = element.querySelector('a.leaflet-popup-close-button');
    const actions = element.querySelector('.popup-header-actions');
    if (closeButton && actions && closeButton.parentElement !== actions) actions.appendChild(closeButton);
}
/* 弹窗标题栏按钮：复制原始报文 + 固定弹窗（各页面共用一份实现） */
function bindPopupActions(layer) {
    if (!layer || typeof layer.on !== 'function') return;

    layer.on('popupopen', function(e) {
        const popup = e && e.popup;
        if (!popup) return;
        applyPopupCloseIcon(popup);
        movePopupCloseIntoHeader(popup);
        ensurePopupActionDelegation(popup.getElement ? popup.getElement() : null, popup);
        popup.__rawView = false;
        popup.__rawBodyHeight = null;
        // 每次重新打开都回到未固定状态（重新定位不会触发 popupopen，固定状态因此保留）
        setPopupPinned(popup, false);
    });

    layer.on('popupclose', function(e) {
        const popup = e && e.popup;
        if (!popup) return;
        if (popup.__hideCollapseHandler) {
            document.removeEventListener('click', popup.__hideCollapseHandler);
            popup.__hideCollapseHandler = null;
        }
        popup.__rawView = false;
        popup.__rawBodyHeight = null;
        // 关闭后恢复默认「点击地图即关闭、被新弹窗顶掉」，下次打开由 Leaflet 重新绑定
        setPopupPinned(popup, false);
    });
}

/* 统一的航警弹窗信息行：持续时间 / 编号（可选独占一行）/ 航警详情 */
function buildNotamPopupRows(options) {
    const settings = options || {};
    const codeRow = settings.fullWidthCode
        ? "<div class='popup-info-row'>" +
            "<span class='popup-label'>" + (settings.codeLabel || '航警编号') + ":</span>" +
            "<span class='popup-value'>" + (settings.code || '') + "</span>" +
          "</div>"
        : "<div class='popup-info-row row-horizontal'>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>" + (settings.codeLabel || '航警编号') + ":</span>" +
            "<span class='popup-value'>" + (settings.code || '') + "</span>" +
            "</div>" +
            "<div class='popup-col'>" +
            "<span class='popup-label'>" + (settings.regionLabel || '飞行情报区') + ":</span>" +
            "<span class='popup-value'>" + (settings.regionValue || '-') + "</span>" +
            "</div>" +
          "</div>";
    let rows = "<div class='popup-info-row'>" +
        "<span class='popup-label'>持续时间:</span>" +
        "<span class='popup-value'>" + (settings.timeText || '') + "</span>" +
        "</div>" + codeRow;

    // 详情默认取全部行（不截断、不加省略号），超出部分由滚动区 + 底部渐隐查看
    const detailLines = typeof settings.detailLines === 'number' ? settings.detailLines : 0;
    const detailHtml = notamDetailHtml(settings.rawMessage, detailLines);
    if (detailHtml) {
        // 外层容器用于承载底部渐隐遮罩（见 styles.css .popup-detail-wrap::after）
        rows += "<div class='popup-info-row'>" +
            "<span class='popup-label'>" + (settings.detailLabel || '航警详情') + ":</span>" +
            "<div class='popup-detail-wrap'>" +
            "<span class='popup-value popup-detail'>" + detailHtml + "</span>" +
            "</div>" +
            "</div>";
    }
    return rows + (settings.extraRows || '');
}

function buildNotamPopupRawView(rawMessage) {
    // 原文视图也按详情区的排版规则展示：清理空行和连续空白，保留有效分行，
    // 再在正文末尾补一处 <br>，避免最后一行贴在渐隐边缘。
    const raw = String(rawMessage == null ? '' : rawMessage)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[\t ]+/g, ' ').trim())
        .filter(line => line !== '')
        .join('\n');
    const rawHtml = escapeNotamText(raw || '暂无航警原文').replace(/\n/g, '<br>') + '<br><br>';
    return "<div class='popup-raw-view' hidden>" +
        "<pre class='popup-raw-content'>" + rawHtml + "</pre>" +
        "</div>";
}

window.extractNotamDetails = extractNotamDetails;
window.buildNotamPopupRows = buildNotamPopupRows;

// 绘制NOTAM多边形
function drawNot(timee, codee, altitude, numm, col, is_self, rawmessage, sourceType = 'NOTAM', fir = '', geometry = '') {
    var timestr = is_self ? null : convertTime(timee);
    const displayType = is_self ? 'NOTAM' : getNotamDisplayType(sourceType);
    const isMsi = displayType === 'MSI';
    const isNotmar = displayType === 'NOTMAR';
    const style = {
        color: col,
        weight: 1,
        opacity: 1,
        fillColor: col,
        fillOpacity: 0.5,
        pane: is_self ? 'overlayPane' : (isNotmar ? 'autoNotmarPane' : (isMsi ? 'autoMsiPane' : 'autoNotamPane'))
    };
    var tmpPolygon = geometryToLayer(geometry, style);
    if (!tmpPolygon) return;
    tmpPolygon.addTo(map);
    // 创建弹出窗口内容
    var popupContent;

    function extractMsiKeywords(text) {
        var upper = String(text || '').toUpperCase();
        var found = MSI_AEROSPACE_KEYWORDS.filter(function(k) {
            return upper.indexOf(k) !== -1;
        });
        return found.length ? found.join(', ') : '-';
    }

    if (!is_self) {
        var popupTitle = isMsi ? 'MSI 信息' : (isNotmar ? 'NOTMAR 信息' : 'NOTAM 信息');
        // MSI 的第二行仅保留海警编号；NOTAM 仍保留编号和飞行情报区并排。
        popupContent = "<div class='notam-popup'>" +
            buildNotamPopupHeader(popupTitle, rawmessage, '', numm) +
            "<div class='notam-popup-body'>" +
            "<div class='popup-structured-view'>" +
            buildNotamPopupRows({
                timeText: timestr,
                code: codee,
                codeLabel: isMsi ? '海警编号' : (isNotmar ? 'NOTMAR 编号' : '航警编号'),
                regionLabel: '飞行情报区',
                regionValue: fir || 'UNKNOWN',
                fullWidthCode: isMsi || isNotmar,
                detailLabel: isMsi ? '海警详情' : (isNotmar ? 'NOTMAR 详情' : '航警详情'),
                rawMessage: rawmessage
            }) +
            "</div>" +
            buildNotamPopupRawView(rawmessage) +
            "</div>" +
            "</div>";
    } else {
        popupContent = "<div class='notam-popup'>" +
            "<div class='notam-popup-header'>" +
            "<h4>用户绘制落区</h4>" +
            "</div>" +
            "<div class='notam-popup-body'>" +
            "<div class='popup-info-row'>" +
            "<span class='popup-value'>航警" + numm + "</span>" +
            "</div>" +
            "</div>" +
            "<div class='notam-popup-buttons'>" +
            "<button class='copy' onclick=\"handleCopy('" + geometry + "')\">复制坐标</button>" +
            "</div>" +
            "</div>";
    }

    tmpPolygon.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'notam-info-popup'
    });

    // 标题栏「隐藏 / 图钉 / 复制」按钮
    bindPopupActions(tmpPolygon);

    // 存储多边形引用
    if (is_self) {
        polygon[numm] = tmpPolygon;
    } else {
        polygonAuto[numm] = tmpPolygon;
    }
    if (window.NotamGlobe) window.NotamGlobe.refresh(true);
}

// 解析坐标字符串
function pullOut(stri) {
    var tmpp = [];
    var stPos = 1;
    var a, b;
    var c, d;
    
    for (var i = 1; i < stri.length; i++) {
        if (stri[i] == "E" || stri[i] == "W") {
            stPos = i + 1;
        }
    }
    
    a = stri.substring(1, stPos - 1);
    b = stri.substring(stPos, stri.length);
    
    if (a.length == 4) {
        c = (a - (a % 100)) / 100 + (a % 100) / 60;
        d = (b - (b % 100)) / 100 + (b % 100) / 60;
    } else if (a.length == 6) {
        c = (a - (a % 10000)) / 10000 + ((a % 10000) - (a % 100)) / 6000 + (a % 100) / 3600;
        d = (b - (b % 10000)) / 10000 + ((b % 10000) - (b % 100)) / 6000 + (b % 100) / 3600;
    }
    
    if (stri[stPos - 1] == "E") {
        tmpp.push(d);
    } else {
        tmpp.push(0 - d);
    }
    
    if (stri[0] == "N") {
        tmpp.push(c);
    } else {
        tmpp.push(0 - c);
    }

    return tmpp;
}
var polygonAuto = [];           // 自动获取的多边形
var groupColors = {};           // 外部段 CLASSIFY → color
var groupColorsFocused = {};    // 聚焦段 CLASSIFY → color
var msiColors = {};             // MSI 行号 → 独立颜色
var notmarColors = {};          // USCG NOTMAR 行号 → 独立颜色
var visibleState = {};          // index → true/false

/* 为一段 CLASSIFY 分配颜色；targetMap/pool 可指定目标映射与颜色池 */
function assignGroupColors(classify, targetMap, pool) {
    const target = targetMap || groupColors;
    const palette = pool || currentColorPool;
    Object.keys(target).forEach(key => { delete target[key]; });
    Object.keys(classify || {}).forEach(key => {
        target[key] = palette[currentColor_idx++ % palette.length];
    });
    return target;
}

/* 同时分配聚焦段与外部段的颜色：聚焦段用聚焦池，其余用全量池 */
function assignAllGroupColors(focusedClassify, classify) {
    assignGroupColors(focusedClassify || {}, groupColorsFocused, currentFocusedColorPool);
    assignGroupColors(classify || {}, groupColors, currentColorPool);
    Object.keys(msiColors).forEach(key => { delete msiColors[key]; });
    Object.keys(notmarColors).forEach(key => { delete notmarColors[key]; });
    if (!dict) return;
    let msiColorIndex = 0;
    let notmarColorIndex = 0;
    for (let index = 0; index < dict.NUM; index++) {
        if (getNotamDisplayType(dict.SOURCE?.[index]) === 'MSI') {
            msiColors[index] = currentMsiColorPool[msiColorIndex++ % currentMsiColorPool.length];
        } else if (getNotamDisplayType(dict.SOURCE?.[index]) === 'NOTMAR') {
            notmarColors[index] = currentNotmarColorPool[notmarColorIndex++ % currentNotmarColorPool.length];
        }
    }
}

function getColorForCode(code) {
    for (const [group, codes] of Object.entries((dict && dict.CLASSIFY_FOCUSED) || {})) {
        if (codes.includes(code)) {
            return groupColorsFocused[group] || currentFocusedColorPool[0];
        }
    }
    if (!dict || !dict.CLASSIFY) return currentColorPool[0];
    for (const [group, codes] of Object.entries(dict.CLASSIFY)) {
        if (codes.includes(code)) {
            return groupColors[group] || currentColorPool[0];
        }
    }
    return currentColorPool[0];
}

function getColorForRecord(index) {
    if (dict && getNotamDisplayType(dict.SOURCE?.[index]) === 'MSI') {
        return msiColors[index] || currentMsiColorPool[0];
    }
    if (dict && getNotamDisplayType(dict.SOURCE?.[index]) === 'NOTMAR') {
        return notmarColors[index] || currentNotmarColorPool[0];
    }
    return getColorForCode(dict?.CODE?.[index]);
}
