// src/utils/response.js

export class ResponseUtil {
  static sendSuccess(res, data = null, messageOrStatus = null, statusOrMessage = 200) {
    let message = null;
    let statusCode = 200;

    if (typeof messageOrStatus === 'number') {
      statusCode = messageOrStatus;
      if (typeof statusOrMessage === 'string') {
        message = statusOrMessage;
      }
    } else {
      if (typeof messageOrStatus === 'string') {
        message = messageOrStatus;
      }
      if (typeof statusOrMessage === 'number') {
        statusCode = statusOrMessage;
      }
    }

    const responseBody = {
      success: true,
      ...(message && { message }),
      ...(data !== undefined && data !== null && { data }),
    };
    return res.status(statusCode).json(responseBody);
  }

  static sendPaginated(res, data, totalOrPagination, page = 1, limit = 20, message = null) {
    let pagination;

    if (totalOrPagination && typeof totalOrPagination === 'object') {
      pagination = {
        total: totalOrPagination.total || 0,
        page: totalOrPagination.page || 1,
        limit: totalOrPagination.limit || 20,
        totalPages: totalOrPagination.totalPages || Math.ceil((totalOrPagination.total || 0) / (totalOrPagination.limit || 20)) || 1,
      };
    } else {
      const total = typeof totalOrPagination === 'number' ? totalOrPagination : 0;
      pagination = {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    const responseBody = {
      success: true,
      ...(message && { message }),
      data,
      pagination,
    };
    return res.status(200).json(responseBody);
  }

  static sendError(res, message, code = 'ERROR', statusCode = 500, details = null) {
    const responseBody = {
      success: false,
      error: {
        code,
        message,
        details: process.env.NODE_ENV === 'production' && statusCode === 500 ? undefined : details,
      },
    };
    return res.status(statusCode).json(responseBody);
  }
}
