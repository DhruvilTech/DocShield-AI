// src/controllers/document.controller.js
import { documentService } from '../services/document.service.js';
import { ResponseUtil } from '../utils/response.js';
import { AppError } from '../errors/AppError.js';

export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      throw AppError.badRequest('No document file was uploaded', 'FILE_REQUIRED');
    }

    const doc = await documentService.uploadDocument(
      req.organization.id,
      req.user.userId,
      req.file,
      req.body,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    return ResponseUtil.sendSuccess(res, { document: doc }, 201, 'Document uploaded and vaulted successfully');
  } catch (error) {
    next(error);
  }
};

export const listDocuments = async (req, res, next) => {
  try {
    const result = await documentService.listDocuments(req.organization.id, req.query);
    return ResponseUtil.sendPaginated(res, result.data, result.pagination);
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const doc = await documentService.getDocumentById(req.params.id, req.organization.id);
    return ResponseUtil.sendSuccess(res, { document: doc });
  } catch (error) {
    next(error);
  }
};

export const updateMetadata = async (req, res, next) => {
  try {
    const doc = await documentService.updateMetadata(
      req.params.id,
      req.organization.id,
      req.body,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, { document: doc }, 200, 'Document metadata updated');
  } catch (error) {
    next(error);
  }
};

export const uploadNewVersion = async (req, res, next) => {
  try {
    if (!req.file) {
      throw AppError.badRequest('No version file was uploaded', 'FILE_REQUIRED');
    }

    const doc = await documentService.uploadNewVersion(
      req.params.id,
      req.organization.id,
      req.user.userId,
      req.file,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    return ResponseUtil.sendSuccess(res, { document: doc }, 201, 'New document version uploaded successfully');
  } catch (error) {
    next(error);
  }
};

export const listVersions = async (req, res, next) => {
  try {
    const versions = await documentService.listVersions(req.params.id, req.organization.id);
    return ResponseUtil.sendSuccess(res, { versions });
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req, res, next) => {
  try {
    const { stream, filename, mimeType, size } = await documentService.getDownloadStream(
      req.params.id,
      req.organization.id,
      null,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    // Sanitize filename for header
    const safeFilename = encodeURIComponent(filename.replace(/["\\]/g, ''));
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Length', size);

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const previewDocument = async (req, res, next) => {
  try {
    const { stream, filename, mimeType, size } = await documentService.getDownloadStream(
      req.params.id,
      req.organization.id,
      null,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    const safeFilename = encodeURIComponent(filename.replace(/["\\]/g, ''));
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Content-Length', size);

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const downloadVersion = async (req, res, next) => {
  try {
    const versionNumber = parseInt(req.params.versionNumber, 10);
    const { stream, filename, mimeType, size } = await documentService.getDownloadStream(
      req.params.id,
      req.organization.id,
      versionNumber,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );

    const safeFilename = encodeURIComponent(filename.replace(/["\\]/g, ''));
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Length', size);

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    await documentService.deleteDocument(
      req.params.id,
      req.organization.id,
      req.user.userId,
      { ip: req.ip, userAgent: req.headers['user-agent'] }
    );
    return ResponseUtil.sendSuccess(res, null, 200, 'Document archived successfully');
  } catch (error) {
    next(error);
  }
};
