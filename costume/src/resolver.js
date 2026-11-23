/**
 * RO Resource Resolver (ES Module)
 * Resolves job, hair, headgear, garment, palettes into exact resource paths
 */

export class ResourceResolver {
  /**
   * @param {Object} data Table loaded from resolver.json
   * @param {string} [basePath=''] Base URL prefix (e.g. '/' or relative)
   */
  constructor(data, basePath = '') {
    this.jobs = data.jobs || {};
    this.headgears = data.headgears || {};
    this.garments = data.garments || {};
    this.robeTopIds = new Set(data.robe_top_ids || []);
    this.basePath = basePath.replace(/\\/g, '/').replace(/\/$/, '');
    this.manifest = data.manifest || null;
  }

  setManifest(manifest) {
    this.manifest = manifest || null;
  }

  resolveUrl(relPath) {
    if (!relPath) return relPath;
    let clean = relPath.replace(/\\/g, '/');
    if (this.basePath && clean.startsWith(this.basePath + '/')) {
      clean = clean.substring(this.basePath.length + 1);
    }
    clean = clean.replace(/^\.\//, '');

    if (this.manifest && this.manifest[clean]) {
      const mapped = this.manifest[clean];
      return this.basePath ? `${this.basePath}/${mapped}` : mapped;
    }
    return relPath;
  }

  isRobeTopLayer(viewId) {
    return this.robeTopIds.has(Number(viewId));
  }

  getGenderStr(gender) {
    return gender === 1 ? '남' : '여';
  }

  getJobInfo(jobId) {
    return this.jobs[String(jobId)] || { name_kr: '초보자', pal_kr: '초보자', has_outfit: false };
  }

  isMadogear(jobId) {
    const j = Number(jobId);
    return j === 4086 || j === 4087 || j === 4112 || j === 4279;
  }

  isDoram(jobId) {
    const j = Number(jobId);
    return (j >= 4217 && j <= 4221) || j === 4308 || j === 4315;
  }

  /**
   * Resolve Body SPR / ACT path
   */
  getBodyPath(jobId, gender, outfit = 0, isMount = false, madoType = 0) {
    const g = this.getGenderStr(gender);
    const jobInfo = this.getJobInfo(jobId);
    let jName = jobInfo.name_kr;
    const race = this.isDoram(jobId) ? '도람족' : '인간족';

    if (this.isMadogear(jobId) && Number(madoType) === 2) {
      jName = (Number(jobId) === 4279) ? 'meister_madogear2' : '마도아머';
    }

    let rel = '';
    if (outfit > 0 && (jobInfo.has_outfit || this.isMadogear(jobId))) {
      rel = `data/sprite/${race}/몸통/${g}/costume_${outfit}/${jName}_${g}_${outfit}`;
    } else {
      rel = `data/sprite/${race}/몸통/${g}/${jName}_${g}`;
    }

    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Resolve Head (Hair) SPR / ACT path
   */
  getHeadPath(headId, gender, jobId = 0) {
    const g = this.getGenderStr(gender);
    const race = this.isDoram(jobId) ? '도람족' : '인간족';
    const rel = `data/sprite/${race}/머리통/${g}/${headId}_${g}`;
    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Resolve Headgear SPR / ACT path
   */
  getHeadgearPath(viewId, gender) {
    if (!viewId) return null;
    const accName = this.headgears[String(viewId)];
    if (!accName) return null;

    const g = this.getGenderStr(gender);
    const rel = `data/sprite/악세사리/${g}/${g}${accName}`;
    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Resolve Garment (Robe) SPR / ACT path
   * Note: Robes can have a job-specific path or fallback path
   */
  getGarmentPath(viewId, gender, jobId) {
    if (!viewId) return null;
    const robeName = this.garments[String(viewId)];
    if (!robeName) return null;

    const g = this.getGenderStr(gender);
    const jobInfo = this.getJobInfo(jobId);
    const jName = jobInfo.name_kr;

    // Primary: data/sprite/로브/<name>/<gender>/<jobname>_<gender>
    // Fallback: data/sprite/로브/<name>/<name>
    const primary = `data/sprite/로브/${robeName}/${g}/${jName}_${g}`;
    const fallback = `data/sprite/로브/${robeName}/${robeName}`;

    return {
      primary: this.basePath ? `${this.basePath}/${primary}` : primary,
      fallback: this.basePath ? `${this.basePath}/${fallback}` : fallback,
      robeName
    };
  }

  /**
   * Resolve Body Palette (.pal) path
   */
  getBodyPalettePath(jobId, gender, bodyPalId, outfit = 0, madoType = 0) {
    if (bodyPalId === undefined || bodyPalId === null || bodyPalId < 0) return null;
    const g = this.getGenderStr(gender);
    const jobInfo = this.getJobInfo(jobId);
    let palName = jobInfo.pal_kr || jobInfo.name_kr;
    const isDoram = this.isDoram(jobId);

    if (this.isMadogear(jobId) && Number(madoType) === 2) {
      palName = (Number(jobId) === 4279) ? 'meister_madogear2' : '마도아머';
    }

    let rel = '';
    if (isDoram) {
      rel = `data/palette/도람족/몸/${palName}_${g}_${bodyPalId}.pal`;
    } else if (outfit > 0 && jobInfo.has_outfit) {
      rel = `data/palette/몸/costume_${outfit}/${palName}_${g}_${bodyPalId}_${outfit}.pal`;
    } else {
      rel = `data/palette/몸/${palName}_${g}_${bodyPalId}.pal`;
    }

    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Resolve Head Palette (.pal) path
   */
  getHeadPalettePath(headId, gender, headPalId, jobId = 0) {
    if (headPalId === undefined || headPalId === null || headPalId < 0) return null;
    const g = this.getGenderStr(gender);
    const isDoram = this.isDoram(jobId);
    let rel = '';
    if (isDoram) {
      rel = `data/palette/도람족/머리/머리${headId}_${g}_${headPalId}.pal`;
    } else {
      rel = `data/palette/머리/머리${headId}_${g}_${headPalId}.pal`;
    }
    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Resolve IMF file path
   */
  getImfPath(jobId, gender, madoType = 0) {
    const g = this.getGenderStr(gender);
    const jobInfo = this.getJobInfo(jobId);
    let imfName = jobInfo.imf_kr || jobInfo.name_kr;

    if (this.isMadogear(jobId) && Number(madoType) === 2) {
      return null; // Madogear suit is a full mecha without human head priority
    }

    const rel = `data/imf/${imfName}_${g}.imf`;
    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }

  /**
   * Shadow path
   */
  getShadowPath() {
    const rel = 'data/sprite/shadow';
    return this.basePath ? `${this.basePath}/${rel}` : rel;
  }
}
