import fs from "node:fs";
import { replaceQuestionsByPrefix } from "./question-bank-utils.mjs";

const sourceUrl = "https://www.cac.gov.cn/2022-10/26/c_1668411101170612.htm";
const source = (chapter, article) => `《中国共产党章程》（中国共产党第二十次全国代表大会部分修改，2022年10月22日通过）· ${chapter}${article === "总纲" ? "" : ` · ${article}`} · ${sourceUrl}`;
const chapterTag = (chapter) => chapter === "总纲" ? "总纲" : chapter.replace(/^第.+章\s*/, "");

const facts = [
  ["总纲", "总纲", "party-constitution:general-program:party-nature", "中国共产党是中国工人阶级的先锋队，同时是中国人民和中华民族的先锋队。", "T", "党章总纲明确，中国共产党同时具有这两个先锋队性质。"],
  ["总纲", "总纲", "party-constitution:general-program:leadership-core", "中国共产党是中国特色社会主义事业的领导核心，但只负责经济建设，不领导其他领域。", "F", "党章总纲规定，中国共产党是中国特色社会主义事业的领导核心，党是最高政治领导力量，党政军民学、东西南北中，党是领导一切的。"],
  ["总纲", "总纲", "party-constitution:general-program:represent-advanced-productivity", "中国共产党代表中国先进生产力的发展要求。", "T", "党章总纲把代表中国先进生产力的发展要求列为党的性质和宗旨的重要内容。"],
  ["总纲", "总纲", "party-constitution:general-program:represent-advanced-culture", "中国共产党代表中国先进文化的前进方向，但只代表党员和干部的文化需求。", "F", "党章总纲规定，中国共产党代表中国先进文化的前进方向，题干把党的代表对象错误缩小为党员和干部。"],
  ["总纲", "总纲", "party-constitution:general-program:represent-people-interests", "中国共产党代表中国最广大人民的根本利益。", "T", "党章总纲规定，中国共产党代表中国最广大人民的根本利益。"],
  ["总纲", "总纲", "party-constitution:general-program:communism-requires-socialism", "共产主义最高理想可以脱离社会主义社会的充分发展和高度发达而直接实现。", "F", "党章总纲规定，共产主义最高理想只有在社会主义社会充分发展和高度发达的基础上才能实现。"],
  ["总纲", "总纲", "party-constitution:general-program:socialism-long-process", "社会主义制度的发展和完善是一个长期的历史过程。", "T", "党章总纲明确，社会主义制度的发展和完善是一个长期的历史过程。"],
  ["总纲", "总纲", "party-constitution:general-program:new-democratic-revolution-victory", "在毛泽东思想指引下，中国共产党领导人民取得了新民主主义革命的胜利，但没有建立人民民主专政的中华人民共和国。", "F", "党章总纲规定，在毛泽东思想指引下，中国共产党领导人民取得了新民主主义革命的胜利，建立了人民民主专政的中华人民共和国。"],
  ["总纲", "总纲", "party-constitution:general-program:socialist-transformation", "新中国成立以后，中国共产党完成了从新民主主义到社会主义的过渡。", "T", "党章总纲明确，新中国成立以后顺利进行了社会主义改造，完成了从新民主主义到社会主义的过渡。"],
  ["总纲", "总纲", "party-constitution:general-program:four-root-causes", "改革开放以来取得一切成绩和进步的根本原因只包括中国特色社会主义道路、理论体系和制度，不包括中国特色社会主义文化。", "F", "党章总纲规定，根本原因还包括发展中国特色社会主义文化，四项内容缺一不可。"],
  ["总纲", "总纲", "party-constitution:general-program:three-historical-tasks", "推进现代化建设、完成祖国统一、维护世界和平与促进共同发展，是党和人民要实现的三大历史任务。", "T", "党章总纲明确列出推进现代化建设、完成祖国统一、维护世界和平与促进共同发展三大历史任务。"],
  ["总纲", "总纲", "party-constitution:general-program:ten-historical-experiences", "坚持人民至上不属于党和人民共同创造的宝贵历史经验。", "F", "党章总纲把坚持人民至上列入经过长期实践积累的宝贵历史经验。"],
  ["总纲", "总纲", "party-constitution:general-program:primary-stage-century", "我国正处于并将长期处于社会主义初级阶段，这一历史阶段需要上百年的时间。", "T", "党章总纲明确，我国社会主义初级阶段需要上百年的时间。"],
  ["总纲", "总纲", "party-constitution:general-program:class-struggle-not-main", "阶级斗争已经成为我国现阶段社会的主要矛盾。", "F", "党章总纲规定，阶级斗争已经不是主要矛盾，但在一定范围内还将长期存在。"],
  ["总纲", "总纲", "party-constitution:general-program:public-ownership-dominant", "我国社会主义建设必须坚持公有制为主体、多种所有制经济共同发展。", "T", "党章总纲把公有制为主体、多种所有制经济共同发展列为基本经济制度。"],
  ["总纲", "总纲", "party-constitution:general-program:distribution-labor-dominant", "我国实行以按劳分配为唯一分配方式的制度。", "F", "党章总纲规定，以按劳分配为主体、多种分配方式并存，题干把多种分配方式错误地说成唯一方式。"],
  ["总纲", "总纲", "party-constitution:general-program:some-first-rich", "党章提出鼓励一部分地区和一部分人先富起来，逐步实现全体人民共同富裕。", "T", "党章总纲明确了鼓励一部分地区和一部分人先富起来、逐步实现共同富裕的要求。"],
  ["总纲", "总纲", "party-constitution:general-program:people-centered-development", "党坚持以人民为中心的发展思想，但发展成果只需由部分人民共享。", "F", "党章总纲明确要求坚持以人民为中心的发展思想，做到发展成果由人民共享，题干将共享范围错误缩小为部分人民。"],

  ["第一章 党员", "第一条", "party-constitution:article-1:eligible-social-strata", "第一条所称可以申请入党的先进分子包括工人、农民、军人、知识分子和其他社会阶层。", "T", "党章第一条列明了这些申请入党的先进分子范围。"],
  ["第一章 党员", "第一条", "party-constitution:article-1:recognize-program-charter", "申请加入中国共产党的人承认党的纲领，但可以不承认党的章程。", "F", "党章第一条规定，申请入党的人必须同时承认党的纲领和章程，题干漏掉了对党的章程的承认。"],
  ["第一章 党员", "第一条", "party-constitution:article-1:execute-decisions-pay-dues", "申请入党的人应当执行党的决议并按期交纳党费。", "T", "党章第一条把执行党的决议和按期交纳党费列为申请入党的条件。"],
  ["第一章 党员", "第二条", "party-constitution:article-2:serve-and-sacrifice", "党员必须全心全意为人民服务，但只有党员干部需要为实现共产主义奋斗终身。", "F", "党章第二条规定，中国共产党党员必须全心全意为人民服务，为实现共产主义奋斗终身，题干把适用对象错误缩小为党员干部。"],
  ["第一章 党员", "第二条", "party-constitution:article-2:ordinary-laborer-member", "党员永远是劳动人民的普通一员。", "T", "党章第二条明确，党员永远是劳动人民的普通一员。"],
  ["第一章 党员", "第三条", "party-constitution:article-3:learn-all-knowledge", "党员义务只要求学习党的历史，不包括科学、文化、法律和业务知识。", "F", "党章第三条规定，党员还要学习科学、文化、法律和业务知识，努力提高为人民服务的本领。"],
  ["第一章 党员", "第三条", "party-constitution:article-3:four-consciousness-four-confidence", "党员应增强“四个意识”、坚定“四个自信”、做到“两个维护”。", "T", "党章第三条把增强“四个意识”、坚定“四个自信”、做到“两个维护”列为党员义务。"],
  ["第一章 党员", "第三条", "party-constitution:article-3:obey-organization-assignment", "党员可以拒绝党组织的工作分配而不承担组织安排的任务。", "F", "党章第三条规定，党员要执行党的决定、服从组织分配、积极完成党的任务。"],
  ["第一章 党员", "第三条", "party-constitution:article-3:oppose-factionalism", "党员应坚决反对一切派别组织和小集团活动。", "T", "党章第三条把反对一切派别组织和小集团活动列为党员义务。"],
  ["第一章 党员", "第三条", "party-constitution:article-3:contact-masses", "党员要密切联系群众，向群众宣传党的主张，并及时向党反映群众意见，职责重点是反映意见而非维护群众正当利益。", "F", "党章第三条规定，党员要密切联系群众，向群众宣传党的主张，及时向党反映群众的意见和要求，维护群众的正当利益；题干将党员义务错误缩减为反映意见。"],
  ["第一章 党员", "第五条", "party-constitution:article-5:introducer-understanding", "入党介绍人要认真了解申请人的思想、品质、经历和工作表现。", "T", "党章第五条规定，入党介绍人要认真了解申请人的思想、品质、经历和工作表现。"],
  ["第一章 党员", "第四条", "party-constitution:article-4:policy-discussion", "党员无权在党的会议上和党报党刊上参加关于党的政策问题的讨论。", "F", "党章第四条第二项规定，党员有权在党的会议上和党报党刊上参加关于党的政策问题的讨论。"],
  ["第一章 党员", "第四条", "party-constitution:article-4:make-suggestions", "党员有权对党的工作提出建议和倡议。", "T", "党章第四条第三项明确，党员享有对党的工作提出建议和倡议的权利。"],
  ["第一章 党员", "第四条", "party-constitution:article-4:vote-and-be-elected", "党员只有表决权和选举权，没有被选举权。", "F", "党章第四条第五项规定，党员享有表决权、选举权和被选举权。"],
  ["第一章 党员", "第四条", "party-constitution:article-4:defense-right", "党组织讨论决定对党员的党纪处分或作出鉴定时，党员本人有权参加和进行申辩。", "T", "党章第四条第六项明确了党员参加和申辩的权利。"],
  ["第一章 党员", "第四条", "party-constitution:article-4:rights-not-deprived", "基层党组织可以剥夺党员的党章规定权利。", "F", "党章第四条明确，党的任何一级组织直至中央都无权剥夺党员的上述权利。"],
  ["第一章 党员", "第五条", "party-constitution:article-5:special-direct-receive", "在特殊情况下，党的中央和省、自治区、直辖市委员会可以直接接收党员。", "T", "党章第五条明确规定了特殊情况下直接接收党员的权限。"],
  ["第一章 党员", "第六条", "party-constitution:article-6:oath-never-betray", "入党誓词要求对党忠诚、积极工作，其中“永不叛党”被归入党员日常纪律要求而非誓词条款。", "F", "党章第六条列明的入党誓词包含“对党忠诚、积极工作”和“永不叛党”，题干混淆了誓词条款与日常纪律要求。"],
  ["第一章 党员", "第七条", "party-constitution:article-7:probation-rights-exception", "预备党员除没有表决权、选举权和被选举权以外，其他权利同正式党员一样。", "T", "党章第七条明确，预备党员只有表决权、选举权和被选举权不同于正式党员。"],
  ["第一章 党员", "第八条", "party-constitution:article-8:cadre-democratic-life", "党员领导干部必须参加党委、党组的民主生活会，但普通党员也必须参加同级党委的民主生活会。", "F", "党章第八条规定，党员领导干部还必须参加党委、党组的民主生活会，题干把这一针对党员领导干部的要求错误扩大到普通党员。"],

  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:four-subordinations", "民主集中制要求党员个人服从党的组织、少数服从多数、下级组织服从上级组织。", "T", "党章第十条列明了民主集中制基本原则中的三层服从关系，并要求全党服从党的全国代表大会和中央委员会。"],
  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:lower-organization-independent-duty", "下级组织只需要向上级组织请示和报告，不需要独立负责地解决职责范围内的问题。", "F", "党章第十条规定，下级组织既要请示和报告工作，又要独立负责地解决自己职责范围内的问题。"],
  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:mutual-information-support-supervision", "上下级组织之间要互通情报、互相支持和互相监督。", "T", "党章第十条明确规定了上下级组织之间的这三项关系。"],
  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:party-affairs-open", "党组织不需要实行党务公开，党员无需了解和参与党内事务。", "F", "党章第十条规定，党的各级组织要按规定实行党务公开，使党员对党内事务有更多了解和参与。"],
  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:four-step-major-decision", "重大问题应按照集体领导、民主集中、个别酝酿、会议决定的原则处理。", "T", "党章第十条明确了党的委员会讨论决定重大问题的四项原则。"],
  ["第二章 党的组织制度", "第十条", "party-constitution:article-10:no-personality-cult", "党章允许在党内发展任何形式的个人崇拜。", "F", "党章第十条明确，党禁止任何形式的个人崇拜。"],
  ["第二章 党的组织制度", "第十一条", "party-constitution:article-11:candidate-discussion", "党内选举的候选人名单要由党组织和选举人充分酝酿讨论。", "T", "党章第十一条对候选人名单的产生作出了这一规定。"],
  ["第二章 党的组织制度", "第十一条", "party-constitution:article-11:voter-choice-rights", "选举人无权要求改变候选人，也不能不选任何候选人或另选他人。", "F", "党章第十一条规定，选举人有了解、要求改变、不选任何一个和另选他人的权利。"],
  ["第二章 党的组织制度", "第十一条", "party-constitution:article-11:no-forced-election", "任何组织和个人不得以任何方式强迫选举人选举或不选举某个人。", "T", "党章第十一条明确禁止以任何方式强迫选举人作出特定选择。"],
  ["第二章 党的组织制度", "第十一条", "party-constitution:article-11:invalid-election-review", "地方和基层代表大会选举违反党章时，由本级委员会直接宣布选举无效即可。", "F", "党章第十一条规定，应由上一级党的委员会调查核实后作出决定，并报再上一级党的委员会审查批准。"],
  ["第二章 党的组织制度", "第十一条", "party-constitution:article-11:delegate-tenure", "党的各级代表大会代表实行任期制。", "T", "党章第十一条明确规定，党的各级代表大会代表实行任期制。"],
  ["第二章 党的组织制度", "第十二条", "party-constitution:article-12:representative-conference-authority", "党的中央和地方各级委员会在必要时召集代表会议，只能进行情况通报，不能讨论和决定重大问题。", "F", "党章第十二条规定，代表会议可以讨论和决定需要及时解决的重大问题。"],
  ["第三章 党的中央组织", "第二十一条", "party-constitution:article-21:representative-conference-fifth", "全国代表会议调整和增选中央委员及候补中央委员的数额，不得超过全国代表大会选出的相应总数的五分之一。", "T", "党章第二十一条明确了全国代表会议调整和增选中央委员及候补中央委员的数量上限。"],
  ["第二章 党的组织制度", "第十三条", "party-constitution:article-13:dispatch-lower-leaders", "在地方和基层代表大会闭会期间，上级组织认为有必要时，不得调动或指派下级党组织负责人。", "F", "党章第十三条规定，在代表大会闭会期间，上级组织认为有必要时可以调动或者指派下级党组织负责人。"],
  ["第二章 党的组织制度", "第十六条", "party-constitution:article-16:request-change-and-execute", "下级组织认为上级决定不符合实际时，可以请求改变；上级坚持原决定的，下级仍必须执行。", "T", "党章第十六条同时规定了请求改变和坚决执行上级决定的要求。"],
  ["第二章 党的组织制度", "第十六条", "party-constitution:article-16:public-dissent-forbidden", "上级组织坚持原决定后，下级组织可以公开发表不同意见而不必报告。", "F", "党章第十六条规定，下级组织必须执行且不得公开发表不同意见，但有权向再上一级组织报告。"],
  ["第二章 党的组织制度", "第十六条", "party-constitution:article-16:propaganda-tools", "党的各级组织的报刊和其他宣传工具必须宣传党的路线、方针、政策和决议。", "T", "党章第十六条明确了党的报刊和其他宣传工具的宣传要求。"],
  ["第二章 党的组织制度", "第十七条", "party-constitution:article-17:close-debate-postpone", "重要问题争论双方人数接近时，无论是否紧急，都必须立即按少数意见作出决定。", "F", "党章第十七条规定，除紧急情况按多数意见执行外，应暂缓决定，进一步调查研究后再表决。"],
  ["第二章 党的组织制度", "第十七条", "party-constitution:article-17:no-personal-major-decision", "任何党员不论职务高低，都不能个人决定重大问题。", "T", "党章第十七条明确禁止党员个人决定重大问题。"],
  ["第二章 党的组织制度", "第十七条", "party-constitution:article-17:emergency-report", "紧急情况下必须由个人作出决定的，事后不需要向党组织报告。", "F", "党章第十七条规定，紧急情况下个人作出决定后要迅速向党组织报告。"],

  ["第三章 党的中央组织", "第十九条", "party-constitution:article-19:national-congress-convened-by-central", "党的全国代表大会由中央委员会召集。", "T", "党章第十九条明确，党的全国代表大会每五年举行一次，由中央委员会召集。"],
  ["第三章 党的中央组织", "第十九条", "party-constitution:article-19:no-postpone-without-emergency", "全国代表大会即使没有非常情况，也可以任意延期举行。", "F", "党章第十九条规定，如无非常情况，全国代表大会不得延期举行。"],
  ["第三章 党的中央组织", "第十九条", "party-constitution:article-19:delegate-count-by-central", "全国代表大会代表的名额和选举办法由中央委员会决定。", "T", "党章第十九条明确规定了全国代表大会代表名额和选举办法的决定机关。"],
  ["第三章 党的中央组织", "第二十条", "party-constitution:article-20:hear-central-report", "党的全国代表大会要听取和审查中央委员会的报告，中央纪律检查委员会的报告则由全国代表会议审查。", "F", "党章第二十条规定，党的全国代表大会既要听取和审查中央委员会的报告，也要审查中央纪律检查委员会的报告，题干混淆了审查机关和会议。"],
  ["第三章 党的中央组织", "第二十二条", "party-constitution:article-22:central-vacancy-vote-order", "中央委员会委员出缺，由中央委员会候补委员按照得票多少依次递补。", "T", "党章第二十二条明确了中央委员会委员出缺时的递补规则。"],
  ["第三章 党的中央组织", "第二十二条", "party-constitution:article-22:politburo-convenes-plenary", "中央委员会全体会议由中央书记处召集。", "F", "党章第二十二条规定，中央委员会全体会议由中央政治局召集。"],
  ["第三章 党的中央组织", "第二十二条", "party-constitution:article-22:central-leads-all-work", "在全国代表大会闭会期间，中央委员会执行大会决议，领导党的全部工作并对外代表中国共产党。", "T", "党章第二十二条明确了中央委员会在全国代表大会闭会期间的职责。"],
  ["第三章 党的中央组织", "第二十三条", "party-constitution:article-23:politburo-closed-session-authority", "中央政治局和中央政治局常务委员会在中央委员会全体会议闭会期间不行使中央委员会职权。", "F", "党章第二十三条规定，中央政治局和其常务委员会在全会闭会期间行使中央委员会职权。"],
  ["第三章 党的中央组织", "第二十三条", "party-constitution:article-23:secretariat-office", "中央书记处不是中央政治局和中央政治局常务委员会的办事机构。", "F", "党章第二十三条明确，中央书记处是中央政治局和其常务委员会的办事机构。"],
  ["第三章 党的中央组织", "第二十三条", "party-constitution:article-23:secretariat-nomination-approval", "中央书记处成员由中央政治局常务委员会提名，中央委员会全体会议通过。", "T", "党章第二十三条明确规定了中央书记处成员的产生程序。"],
  ["第三章 党的中央组织", "第二十三条", "party-constitution:article-23:general-secretary-duties", "中央委员会总书记只负责召集中央政治局会议，不主持中央书记处的工作。", "F", "党章第二十三条规定，总书记负责召集中央政治局及其常委会会议，并主持中央书记处工作。"],
  ["第三章 党的中央组织", "第二十三条", "party-constitution:article-23:leadership-continuity", "每届中央委员会产生的中央领导机构和中央领导人要工作到下届中央委员会产生新的领导机构和领导人为止。", "T", "党章第二十三条明确了中央领导机构和领导人在换届期间继续主持经常工作的规则。"],
  ["第三章 党的中央组织", "第二十四条", "party-constitution:article-24:pla-party-organization", "中国人民解放军的党组织根据国务院的指示进行工作。", "F", "党章第二十四条规定，中国人民解放军的党组织根据中央委员会的指示进行工作。"],
  ["第三章 党的中央组织", "第二十四条", "party-constitution:article-24:cmc-party-political-work", "中央军事委员会负责军队中党的工作和政治工作，并对军队中党的组织体制和机构作出规定。", "T", "党章第二十四条明确了中央军事委员会负责的军队党务和政治工作。"],

  ["第四章 党的地方组织", "第二十八条", "party-constitution:article-28:local-leadership-election-approval", "党的地方各级委员会全体会议选举常务委员会和书记、副书记，并报上级党的委员会批准。", "T", "党章第二十八条规定，党的地方各级委员会全体会议选举常务委员会和书记、副书记，并报上级党的委员会批准。"],
  ["第四章 党的地方组织", "第二十五条", "party-constitution:article-25:local-congress-convened", "党的地方各级代表大会由上一级党的委员会召集。", "F", "党章第二十五条规定，党的地方各级代表大会由同级党的委员会召集，特殊情况下经上一级委员会批准可提前或延期。"],
  ["第四章 党的地方组织", "第二十五条", "party-constitution:article-25:local-delegate-method", "党的地方各级代表大会代表的名额和选举办法由同级党的委员会决定，并报上一级党的委员会批准。", "T", "党章第二十五条明确规定了地方代表大会代表名额和选举办法的决定、报批程序。"],
  ["第四章 党的地方组织", "第二十七条", "party-constitution:article-27:provincial-committee-party-age", "省、自治区、直辖市、设区的市和自治州委员会的委员和候补委员必须有三年以上党龄。", "F", "党章第二十七条规定，上述委员会委员和候补委员必须有五年以上党龄。"],
  ["第四章 党的地方组织", "第二十七条", "party-constitution:article-27:local-vacancy-vote-order", "党的地方各级委员会委员出缺，由候补委员按照得票多少依次递补。", "T", "党章第二十七条明确了地方委员会委员出缺时的递补规则。"],
  ["第四章 党的地方组织", "第二十八条", "party-constitution:article-28:standing-committee-report", "党的地方各级委员会常务委员会不需要向委员会全体会议报告工作，也不接受监督。", "F", "党章第二十八条规定，常务委员会要定期向委员会全体会议报告工作，接受监督。"],
  ["第四章 党的地方组织", "第二十九条", "party-constitution:article-29:district-committee-representative", "党的地区委员会和相当于地区委员会的组织，是省、自治区委员会在一定范围内派出的代表机关。", "T", "党章第二十九条明确了党的地区委员会及相当组织的性质。"],
  ["第四章 党的地方组织", "第二十六条", "party-constitution:article-26:local-congress-elects-two-committees", "党的地方各级代表大会只选举同级党的委员会，不选举同级纪律检查委员会。", "F", "党章第二十六条规定，地方各级代表大会要选举同级党的委员会和同级纪律检查委员会。"],

  ["第五章 党的基层组织", "第三十条", "party-constitution:article-30:grassroots-committee-approval", "党的基层组织根据工作需要和党员人数设立不同层级委员会时，需要经上级党组织批准。", "T", "党章第三十条规定，基层委员会、总支部委员会、支部委员会的设立要经上级党组织批准。"],
  ["第五章 党的基层组织", "第三十条", "party-constitution:article-30:candidate-consultation", "基层委员会委员候选人的提出只需征求党组织意见，不需要征求党员和群众意见。", "F", "党章第三十条规定，提出委员候选人要广泛征求党员和群众的意见。"],
  ["第五章 党的基层组织", "第三十二条", "party-constitution:article-32:grassroots-education-management-service", "党的基层组织要对党员进行教育、管理、监督和服务。", "T", "党章第三十二条把教育、管理、监督和服务列为基层组织基本任务。"],
  ["第五章 党的基层组织", "第三十二条", "party-constitution:article-32:mobile-member-management", "基层组织应加强和改进流动党员管理，但这项要求只适用于预备党员。", "F", "党章第三十二条明确要求加强和改进流动党员管理，题干把管理对象错误限定为预备党员。"],
  ["第五章 党的基层组织", "第三十三条", "party-constitution:article-33:street-township-unified-leadership", "街道、乡、镇党的基层委员会和村、社区党组织统一领导本地区基层各类组织和各项工作。", "T", "党章第三十三条明确了街道、乡、镇党委和村、社区党组织的统一领导职责。"],
  ["第五章 党的基层组织", "第三十三条", "party-constitution:article-33:nonpublic-organization-law-guidance", "非公有制经济组织中党的基层组织要引导和监督企业遵守国家法律法规，但监督对象只包括企业的党组织活动。", "F", "党章第三十三条规定，非公有制经济组织中的基层党组织要引导和监督企业遵守国家法律法规，题干把监督对象错误缩小为企业党组织活动。"],
  ["第五章 党的基层组织", "第三十二条", "party-constitution:article-32:grassroots-task-resist-misconduct", "基层组织要教育党员和群众自觉抵制不良倾向，同各种违纪违法行为作斗争。", "T", "党章第三十二条把抵制不良倾向、同违纪违法行为作斗争列为基本任务。"],
  ["第五章 党的基层组织", "第三十四条", "party-constitution:article-34:party-branch-four-duties", "党支部的职责不包括服务群众。", "F", "党章第三十四条规定，党支部担负组织群众、宣传群众、凝聚群众、服务群众等职责。"],

  ["第六章 党的干部", "第三十五条", "party-constitution:article-35:cadre-training-selection-evaluation-supervision", "党重视教育、培训、选拔、考核和监督干部。", "T", "党章第三十五条明确列出党对干部教育、培训、选拔、考核和监督的重视。"],
  ["第六章 党的干部", "第三十五条", "party-constitution:article-35:female-minority-cadres", "党重视培养、选拔女干部和少数民族干部，其中少数民族干部只在民族地区培养和选拔。", "F", "党章第三十五条规定，党重视培养、选拔女干部和少数民族干部，并未将少数民族干部限定在民族地区。"],
  ["第六章 党的干部", "第三十七条", "party-constitution:article-37:outside-cadre-cooperation", "党员干部应当善于同党外干部合作共事，尊重他们，虚心学习他们的长处。", "T", "党章第三十七条明确了党员干部同党外干部合作共事的要求。"],
  ["第六章 党的干部", "第三十六条", "party-constitution:article-36:cadre-no-abuse-private-gain", "党的各级领导干部可以滥用职权、谋求私利，只要完成工作任务即可。", "F", "党章第三十六条要求干部依法办事、清正廉洁，反对任何滥用职权、谋求私利的行为。"],

  ["第七章 党的纪律", "第三十九条", "party-constitution:article-39:discipline-guarantee", "党的纪律是维护党的团结统一、完成党的任务的保证。", "T", "党章第三十九条明确了党的纪律的性质和作用。"],
  ["第七章 党的纪律", "第四十条", "party-constitution:article-40:no-retaliation-ban", "党内可以用违反党章和国家法律的手段对待党员，也可以打击报复和诬告陷害。", "F", "党章第四十条严格禁止用违法手段对待党员，严格禁止打击报复和诬告陷害。"],
  ["第七章 党的纪律", "第四十三条", "party-constitution:article-43:appeal-not-withheld", "党员对处分决定不服提出申诉的，有关党组织必须负责处理或者迅速转递，不得扣压。", "T", "党章第四十三条明确了党员申诉的处理和转递要求。"],

  ["第八章 党的纪律检查机关", "第四十五条", "party-constitution:article-45:central-commission-leadership", "党的中央纪律检查委员会在党的中央委员会领导下进行工作。", "T", "党章第四十五条明确了中央纪律检查委员会的领导关系。"],
  ["第八章 党的纪律检查机关", "第四十五条", "party-constitution:article-45:stationed-discipline-groups", "党的中央和地方纪律检查委员会不得向党和国家机关派驻纪律检查组。", "F", "党章第四十五条规定，党的中央和地方纪律检查委员会向同级党和国家机关全面派驻纪律检查组，并按规定向有关国有企业、事业单位派驻。"],

  ["第九章 党组", "第四十八条", "party-constitution:article-48:party-group-major-tasks", "党组的任务包括讨论和决定本单位的重大问题，以及做好干部管理工作。", "T", "党章第四十八条把讨论决定本单位重大问题、做好干部管理工作列为党组主要任务。"],
  ["第十章 党和共产主义青年团的关系", "第五十一条", "party-constitution:article-51:league-school", "中国共产主义青年团是广大青年在实践中学习中国特色社会主义和共产主义的学校。", "T", "党章第五十一条明确了共青团作为青年学习中国特色社会主义和共产主义学校的性质。"],
  ["第十一章 党徽党旗", "第五十五条", "party-constitution:article-55:protect-emblem-flag-dignity", "党的各级组织和每一个党员都要维护党徽党旗的尊严，并按规定制作和使用党徽党旗。", "T", "党章第五十五条明确了维护党徽党旗尊严以及按规定制作、使用的要求。"]
];

if (facts.length !== 100) throw new Error(`Expected 100 judgment facts, received ${facts.length}`);

const judges = facts.map(([chapter, article, fact_key, question, answer, correctFact], index) => ({
  id: `party-constitution-judge-${String(index + 1).padStart(3, "0")}`,
  type: "judge",
  topic: "party-constitution",
  fact_key,
  question,
  answer,
  explanation: `${answer === "T" ? "正确" : "错误"}。${correctFact}`,
  source: source(chapter, article),
  tags: [chapterTag(chapter), article, "2022年党章"],
  updated_at: "2026-10-03"
}));

const current = JSON.parse(fs.readFileSync("public/data/questions.json", "utf8"));
const next = replaceQuestionsByPrefix(current, "party-constitution-judge-", judges);
fs.writeFileSync("public/data/questions.json", `${JSON.stringify(next, null, 2)}\n`);
