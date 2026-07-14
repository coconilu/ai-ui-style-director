export const EXPERIENCE_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "consumer-app",
    label: "Consumer App",
    labelZh: "C 端应用",
    aliases: Object.freeze(["consumer", "consumer app", "c端", "c端应用", "用户端应用"])
  }),
  Object.freeze({
    id: "marketing-site",
    label: "Marketing Site",
    labelZh: "营销前台",
    aliases: Object.freeze([
      "marketing",
      "marketing site",
      "marketing website",
      "landing page",
      "营销站点",
      "品牌官网"
    ])
  }),
  Object.freeze({
    id: "commerce",
    label: "Commerce",
    labelZh: "电商与交易",
    aliases: Object.freeze(["commerce", "ecommerce", "e-commerce", "电商", "交易"])
  }),
  Object.freeze({
    id: "content-docs",
    label: "Content & Docs",
    labelZh: "内容与文档",
    aliases: Object.freeze(["content", "docs", "documentation", "内容", "文档"])
  }),
  Object.freeze({
    id: "business-app",
    label: "Business App",
    labelZh: "B 端业务系统",
    aliases: Object.freeze([
      "business",
      "business app",
      "management system",
      "b2b",
      "b端",
      "业务系统",
      "管理系统"
    ])
  }),
  Object.freeze({
    id: "admin-console",
    label: "Admin Console",
    labelZh: "管理控制台",
    aliases: Object.freeze(["admin", "admin console", "dashboard", "后台", "管理台"])
  })
]);

export const EXPERIENCE_TYPE_IDS = Object.freeze(
  EXPERIENCE_TYPE_DEFINITIONS.map((definition) => definition.id)
);

export const EXPERIENCE_TYPE_ORDER = Object.freeze(
  Object.fromEntries(EXPERIENCE_TYPE_IDS.map((id, index) => [id, index]))
);

const EXPERIENCE_TYPE_ID_SET = new Set(EXPERIENCE_TYPE_IDS);

export function isExperienceType(value) {
  return typeof value === "string" && EXPERIENCE_TYPE_ID_SET.has(value);
}

export function countExperienceTypes(values = []) {
  if (values === null || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError("values must be iterable.");
  }

  const counts = Object.fromEntries(EXPERIENCE_TYPE_IDS.map((id) => [id, 0]));
  for (const value of values) {
    const experienceType = typeof value === "string" ? value : value?.experienceType;
    if (isExperienceType(experienceType)) counts[experienceType] += 1;
  }
  return counts;
}
