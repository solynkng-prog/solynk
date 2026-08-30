const express = require('express');
const router = express.Router();
const AdminController = require('./admin.controller');
const { authenticate, requireAdmin } = require('../../shared/middleware/auth.middleware');

router.use(authenticate, requireAdmin);

router.get('/dashboard', AdminController.getDashboard);

router.get('/users', AdminController.listUsers);
router.get('/users/:id', AdminController.getUser);
router.patch('/users/:id/plan', AdminController.updateUserPlan);
router.patch('/users/:id/status', AdminController.updateUserStatus);
router.delete('/users/:id', AdminController.deleteUser);

router.get('/installers', AdminController.listInstallers);
router.patch('/installers/:id/verify', AdminController.verifyInstaller);
router.patch('/installers/:id/status', AdminController.updateInstallerStatus);
router.delete('/installers/:id', AdminController.deleteInstaller);

router.get('/reports', AdminController.listReports);
router.get('/calculations', AdminController.getCalculations);
router.get('/revenue', AdminController.getRevenue);
router.get('/activity', AdminController.getActivity);

module.exports = router;
