/**
 * i18n.js — 3개국어 지원 (한국어 / English / Français)
 * 사용: i18n.t('key'), i18n.formatN('key', n), i18n.setLang('en')
 */
const i18n = (() => {
    const strings = {
        ko: {
            'app.title':             "Angel's Stitch",
            'app.description':       '사진으로 만든 나만의 도안 종이와 폰 어디서든 한땀한땀 기록하세요',
            'nav.home':              '홈',
            'nav.create':            '만들기',
            'nav.project':           '프로젝트',
            'home.recentProjects':   '최근 프로젝트',
            'home.newPattern':       '시작하기',
            'home.emptyState':       '저장된 프로젝트가 없습니다',
            'home.emptyHint':        '새 도안을 만드세요',
            'upload.selectPhoto':    '사진을 선택하세요',
            'upload.hint':           '갤러리에서 이미지를 불러옵니다',
            'upload.reselect':       '다시 선택',
            'upload.next':           '다음 단계로',
            'crop.recrop':           '다시 자르기',
            'crop.generate':         '도안 생성하기',
            'crop.gridSize':         '스티치 수',
            'crop.colorCount':       '색상 수',
            'crop.gridOff':          '격자 보기',
            'crop.gridOn':           '격자 감추기',
            'crop.recalculating':    '계산중…',
            'generating.text':       '도안을 만들고 있어요...',
            'done.grid':             '크기',
            'done.colors':           '색상',
            'done.totalStitches':    '총 스티치',
            'done.threadInfo':       '실 정보 (DMC)',
            'done.projectName':      '프로젝트명',
            'done.rename':           '이름 변경',
            'done.enterStitch':      '스티치 모드',
            'done.downloadPdf':      '도안 다운로드',
            'done.saving':           '저장중…',
            'done.colorUnit':        'N색',
            'done.skeinUnit':        'N 타래',
            'done.stitchUnit':       'N 칸',
            'done.autoProjectName':  'Project',
            'detail.back':           '프로젝트 목록',
            'detail.progress':       '작업 진행률',
            'detail.threadList':     '실 정보 (DMC)',
            'detail.projectName':    '프로젝트명',
            'detail.rename':         '이름 변경',
            'detail.enterStitch':    '스티치 모드',
            'detail.downloadPdf':    '도안 다운로드',
            'detail.delete':         '프로젝트 삭제',
            'detail.placeholder':    '나의 도안',
            'detail.skeinUnit':      'N 타래',
            'detail.stitchUnit':     'N 칸',
            'stitch.threadList':     '실 정보 (DMC)',
            'stitch.threadHint':     '작업할 실을 선택하세요',
            'toast.imageError':      '이미지를 가져오지 못했어요',
            'toast.generateError':   '이런, 오류가 발생했어요!',
            'toast.saved':           '저장됐어요 ✓',
            'toast.autoSaveFail':    '자동저장이 안 됐으니 직접 해 주세요',
            'toast.renamed':         '이름이 변경됐어요 ✓',
            'toast.renameFail':      '이름을 변경하지 못했어요',
            'toast.deleted':         '삭제됐어요 ✓',
            'toast.pdfDone':         '다운로드 완료 ✓',
            'toast.pdfError':        '도안을 다운받지 못했어요',
            'toast.nameSaved':       '이름이 저장되었습니다 ✓',
            'toast.detailError':     '프로젝트 정보를 못 찾았어요',
            'toast.projectNotFound': '프로젝트를 못 찾았어요',
            'toast.openError':       '프로젝트가 안 열려요',
            'confirm.deleteMessage': '정말 N 삭제를 원하세요?',
            'confirm.cancel':        '취소',
            'confirm.ok':            '확인',
        },
        en: {
            'app.title':             "Angel's Stitch",
            'app.description':       'Your Photos as Patterns. Track Every Stitch on Paper or Mobile.',
            'nav.home':              'Home',
            'nav.create':            'Create',
            'nav.project':           'Projects',
            'home.recentProjects':   'Recent Projects',
            'home.newPattern':       'New Pattern',
            'home.emptyState':       'No Saved Projects',
            'home.emptyHint':        'Start in Create',
            'upload.selectPhoto':    'Select a Photo',
            'upload.hint':           'Load an Image from Your Gallery',
            'upload.reselect':       'Change Photo',
            'upload.next':           'Next',
            'crop.recrop':           'Re-Crop',
            'crop.generate':         'Generate Pattern',
            'crop.gridSize':         'Stitch Count',
            'crop.colorCount':       'Colours',
            'crop.gridOff':          'Hide Grid',
            'crop.gridOn':           'Show Grid',
            'crop.recalculating':    'Calculating…',
            'generating.text':       'Generating Pattern…',
            'done.grid':             'Dimensions',
            'done.colors':           'Colours',
            'done.totalStitches':    'Total Stitches',
            'done.threadInfo':       'Thread Info (DMC)',
            'done.projectName':      'Project Name',
            'done.rename':           'Rename',
            'done.enterStitch':      'Stitch Mode',
            'done.downloadPdf':      'Download Pattern',
            'done.saving':           'Saving…',
            'done.colorUnit':        'N Colours',
            'done.skeinUnit':        'N skeins',
            'done.stitchUnit':       'N st',
            'done.autoProjectName':  'Project',
            'detail.back':           'Project List',
            'detail.progress':       'Progress',
            'detail.threadList':     'Thread Info (DMC)',
            'detail.projectName':    'Project Name',
            'detail.rename':         'Rename',
            'detail.enterStitch':    'Stitch Mode',
            'detail.downloadPdf':    'Download Pattern',
            'detail.delete':         'Delete Project',
            'detail.placeholder':    'My Pattern',
            'detail.skeinUnit':      'N skeins',
            'detail.stitchUnit':     'N st',
            'stitch.threadList':     'Thread Info (DMC)',
            'stitch.threadHint':     'Select to Highlight on Pattern',
            'toast.imageError':      'Failed to Load Image',
            'toast.generateError':   'Something Went Wrong',
            'toast.saved':           'Saved ✓',
            'toast.autoSaveFail':    'Auto-Save Failed. Save Manually.',
            'toast.renamed':         'Name Updated ✓',
            'toast.renameFail':      'Failed to Update Name',
            'toast.deleted':         'Deleted ✓',
            'toast.pdfDone':         'Downloaded Successfully ✓',
            'toast.pdfError':        'Failed to Download Pattern',
            'toast.nameSaved':       'Name Saved ✓',
            'toast.detailError':     'Failed to Load Project Details',
            'toast.projectNotFound': 'Failed to Load Project',
            'toast.openError':       'Failed to Open Project',
            'confirm.deleteMessage': 'Sure to Delete N?',
            'confirm.cancel':        'Cancel',
            'confirm.ok':            'Confirm',
        },
        fr: {
            'app.title':             "Angel's Stitch",
            'app.description':       'Vos Photos en Motifs Uniques. Suivez Chaque Point sur Papier ou Mobile.',
            'nav.home':              'Accueil',
            'nav.create':            'Créer',
            'nav.project':           'Projets',
            'home.recentProjects':   'Projets Récents',
            'home.newPattern':       'Nouveau Motif',
            'home.emptyState':       'Aucun Projet Enregistré',
            'home.emptyHint':        'Commencez dans Créer',
            'upload.selectPhoto':    'Sélectionnez une Photo',
            'upload.hint':           'Chargez une Image depuis votre Galerie',
            'upload.reselect':       'Changer de Photo',
            'upload.next':           'Suivant',
            'crop.recrop':           'Recadrer',
            'crop.generate':         'Générer le Motif',
            'crop.gridSize':         'Nombre de Points',
            'crop.colorCount':       'Couleurs',
            'crop.gridOff':          'Masquer la Grille',
            'crop.gridOn':           'Afficher la Grille',
            'crop.recalculating':    'Recalcul…',
            'generating.text':       'Génération du Motif…',
            'done.grid':             'Dimensions',
            'done.colors':           'Couleurs',
            'done.totalStitches':    'Points Totaux',
            'done.threadInfo':       'Infos Fils (DMC)',
            'done.projectName':      'Nom du Projet',
            'done.rename':           'Renommer',
            'done.enterStitch':      'Mode Broderie',
            'done.downloadPdf':      'Télécharger le Motif',
            'done.saving':           'Enregistrement…',
            'done.colorUnit':        'N Couleurs',
            'done.skeinUnit':        'N pelotes',
            'done.stitchUnit':       'N pts',
            'done.autoProjectName':  'Projet',
            'detail.back':           'Liste des Projets',
            'detail.progress':       'Avancement',
            'detail.threadList':     'Infos Fils (DMC)',
            'detail.projectName':    'Nom du Projet',
            'detail.rename':         'Renommer',
            'detail.enterStitch':    'Mode Broderie',
            'detail.downloadPdf':    'Télécharger le Motif',
            'detail.delete':         'Supprimer le Projet',
            'detail.placeholder':    'Mon Motif',
            'detail.skeinUnit':      'N pelotes',
            'detail.stitchUnit':     'N pts',
            'stitch.threadList':     'Infos Fils (DMC)',
            'stitch.threadHint':     'Sélectionner pour Afficher sur le Motif',
            'toast.imageError':      "Échec du Chargement de l'Image",
            'toast.generateError':   'Une Erreur est Survenue',
            'toast.saved':           'Enregistré ✓',
            'toast.autoSaveFail':    'Échec Auto-Save. Sauvegardez.',
            'toast.renamed':         'Nom Modifié ✓',
            'toast.renameFail':      'Échec de la Modification du Nom',
            'toast.deleted':         'Supprimé ✓',
            'toast.pdfDone':         'Téléchargé avec Succès ✓',
            'toast.pdfError':        'Échec du Téléchargement du Motif',
            'toast.nameSaved':       'Nom Enregistré ✓',
            'toast.detailError':     'Échec du Chargement des Détails',
            'toast.projectNotFound': 'Échec du Chargement du Projet',
            'toast.openError':       "Impossible d'Ouvrir le Projet",
            'confirm.deleteMessage': 'Supprimer N ?',
            'confirm.cancel':        'Annuler',
            'confirm.ok':            'Confirmer',
        }
    };

    const LANG_ORDER = ['ko', 'en', 'fr'];
    let currentLang = localStorage.getItem('cstitch-lang') || 'ko';
    if (!strings[currentLang]) currentLang = 'ko';

    function t(key) {
        return (strings[currentLang] && strings[currentLang][key])
            || (strings.ko[key])
            || key;
    }

    // N을 숫자로 치환: i18n.formatN('done.skeinUnit', 3) → "3 타래"
    function formatN(key, n) {
        return t(key).replace('N', n);
    }

    function setLang(lang) {
        if (!strings[lang]) return;
        currentLang = lang;
        localStorage.setItem('cstitch-lang', lang);
        document.documentElement.lang = lang;
        applyToDOM();
    }

    function getLang() { return currentLang; }

    function cycleLang() {
        const idx = LANG_ORDER.indexOf(currentLang);
        setLang(LANG_ORDER[(idx + 1) % LANG_ORDER.length]);
    }

    function applyToDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const attr = el.dataset.i18nAttr;
            const text = t(key);
            if (attr) {
                el.setAttribute(attr, text);
            } else {
                el.textContent = text;
            }
        });
        // 언어 버튼 레이블 업데이트
        const btn = document.getElementById('lang-switch-btn');
        if (btn) btn.textContent = currentLang.toUpperCase();
    }

    return { t, formatN, setLang, getLang, cycleLang, applyToDOM };
})();
