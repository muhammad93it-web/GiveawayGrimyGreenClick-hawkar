import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metaRouter from "./meta";
import giveawaysRouter from "./giveaways";

const router: IRouter = Router();

router.use(healthRouter);
router.use(metaRouter);
router.use(giveawaysRouter);

export default router;
