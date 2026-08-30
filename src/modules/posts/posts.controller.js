const { prisma } = require('../../config/prisma');

class PostsController {
  static async list(req, res, next) {
    try {
      const posts = await prisma.post.findMany({
        orderBy: { createdAt: 'desc' }
      });
      res.json({ success: true, data: posts });
    } catch (err) {
      next(err);
    }
  }

  static async get(req, res, next) {
    try {
      const post = await prisma.post.findUnique({
        where: { id: Number(req.params.id) }
      });
      if (!post) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Post not found.' }
        });
      }
      res.json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  }

  static async create(req, res, next) {
    try {
      const { title, content, published = false } = req.body;
      if (!title || typeof title !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'A title is required.' }
        });
      }
      const post = await prisma.post.create({
        data: { title, content, published: Boolean(published) }
      });
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const { title, content, published } = req.body;
      const post = await prisma.post.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(published !== undefined && { published: Boolean(published) })
        }
      });
      res.json({ success: true, data: post });
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Post not found.' }
        });
      }
      next(err);
    }
  }

  static async remove(req, res, next) {
    try {
      await prisma.post.delete({
        where: { id: Number(req.params.id) }
      });
      res.status(204).send();
    } catch (err) {
      if (err.code === 'P2025') {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Post not found.' }
        });
      }
      next(err);
    }
  }
}

module.exports = PostsController;
