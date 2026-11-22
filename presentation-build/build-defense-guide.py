from pathlib import Path
import json
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT=Path(__file__).resolve().parent.parent
data=json.loads((ROOT/'presentation-build/defense-guide-content.json').read_text(encoding='utf-8'))
out=ROOT/'presentation-output/ExamForge_Rakovodstvo_za_zashtita.docx'
doc=Document()
sec=doc.sections[0]
sec.page_width=Cm(21); sec.page_height=Cm(29.7)
sec.top_margin=Cm(1.85);sec.bottom_margin=Cm(1.85)
sec.left_margin=Cm(2.1);sec.right_margin=Cm(2.1)
sec.footer_distance=Cm(.8)
for name,size in [('Normal',12),('Title',25),('Subtitle',13),('Heading 1',16),('Heading 2',13),('Heading 3',12)]:
    st=doc.styles[name];st.font.name='Times New Roman';st.font.size=Pt(size);st.font.color.rgb=RGBColor(0,0,0)
    st.element.get_or_add_rPr().rFonts.set(qn('w:ascii'),'Times New Roman')
    st.element.rPr.rFonts.set(qn('w:hAnsi'),'Times New Roman')
    st.paragraph_format.space_after=Pt(4)
    st.paragraph_format.line_spacing=1.02
for name in ['Heading 1','Heading 2','Heading 3']:
    doc.styles[name].font.bold=True
    doc.styles[name].paragraph_format.keep_with_next=True
    doc.styles[name].paragraph_format.space_before=Pt(8)
doc.styles['Normal'].paragraph_format.widow_control=True
for name in ['Title','Subtitle']:
    for border in list(doc.styles[name].element.xpath('.//w:pBdr')):
        border.getparent().remove(border)
footer=sec.footer.paragraphs[0];footer.alignment=WD_ALIGN_PARAGRAPH.RIGHT
r=footer.add_run('Страница ');r.font.size=Pt(10)
f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');footer._p.append(f)
doc.core_properties.title='Ръководство за защита на ExamForge'
doc.core_properties.subject='Текст за представяне на 17 слайда и подготовка за въпроси'
doc.core_properties.author=''

def p(text,bold=False,size=None):
    a=doc.add_paragraph();r=a.add_run(text);r.bold=bold
    if size:r.font.size=Pt(size)
    return a

def labelled(label,text):
    a=doc.add_paragraph();a.paragraph_format.space_after=Pt(4)
    r=a.add_run(label+' ');r.bold=True
    a.add_run(text)
    return a

def newpage(title):
    h=doc.add_heading(title,1)
    h.paragraph_format.page_break_before=True

def slide(n):
    s=data['slides'][n-1]
    h=doc.add_heading(f"Слайд {n} {s['title']}",2)
    h.paragraph_format.space_before=Pt(9)
    a=p('Ориентир за говорене  '+s['time'],size=10.5)
    a.paragraph_format.keep_with_next=True
    label=p('Какво да кажеш',bold=True);label.paragraph_format.keep_with_next=True
    p(s['say'])
    a=labelled('Какво да покажеш',s['show'])
    if s['transition']:labelled('Преход',s['transition'])

doc.add_paragraph('Ръководство за защита на ExamForge','Title')
doc.add_paragraph('Готов текст за всеки слайд и подготовка за въпроси','Subtitle')
p(data['intro'])
doc.add_heading('Как да използваш ръководството',1)
p('Първо прочети целия текст и се увери, че разбираш всяко изречение. След това направи репетиция с отворена презентация и таймер. На защитата използвай слайдовете като опора, а не като текст за четене.')
doc.add_heading('Време и последователност',1)
p('Текстът е планиран за около 10 минути говорене при спокойно темпо. Действителното време зависи от паузите и начина, по който разказваш. Репетирай с таймер.')
labelled('Слайдове 1 до 7','Представяне на приложението и основните действия на потребителя.')
labelled('Слайдове 8 до 10','Проблем, мотивация и целева аудитория.')
labelled('Слайдове 11 до 17','Техническа реализация, алгоритми, демонстрация и заключение.')
p('На слайд 16 е отделена практическа част от 8 до 9 минути. За нея има подробен план по-долу. Ако разполагаш с по-кратко общо време, използвай съкратената демонстрация от около 3 минути.')
doc.add_heading('Преди да започнеш',1)
for v in ['Отвори презентацията и сайта предварително и провери дали работят.','Използвай демонстрационен профил с налични въпроси и поне един приключен тест.','Подготви кратък тест и провери предварително избрания предмет и теми.','Запази достъпни екраните от презентацията като резервен вариант.']:
    doc.add_paragraph(v,'List Bullet')
p('Говори само за това, което действително си реализирал и можеш да покажеш. Не представяй примерните резултати като доказано подобрение на знанията на реални ученици.',size=11)

newpage('Начало на представянето')
for n in [1,2,3]:slide(n)
newpage('Основни възможности на приложението')
for n in [4,5,6]:slide(n)
newpage('Резултати мотивация и потребители')
for n in [7,8,9,10]:slide(n)
newpage('Технологии и защита на данните')
for n in [11,12,13]:slide(n)
newpage('Обяснение на алгоритмите')
for n in [14,15]:slide(n)
doc.add_heading('Кратък пример при допълнителен въпрос',2)
p('Ако една тема има много повече въпроси от останалите, случайният тест обикновено включва повече от нея. Балансираният метод първо определя желаното участие на темите. Той може да постигне равномерно разпределение само когато има достатъчно подходящи въпроси.')
newpage('Демонстрация и завършване')
for n in [16,17]:slide(n)
doc.add_heading('План за демонстрация от 8 до 9 минути',2)
demo=[('Първа минута','Покажи началния екран и банката. Кажи „Тук виждам наличните въпроси и мога да ги филтрирам“. Не показвай парола или настройки с тайни ключове.'),('Втора минута','Избери предмет и тема. Покажи търсенето или филтъра за трудност с едно действие.'),('Трета и четвърта минута','Отвори „Нов изпит“. Избери кратък тест, времетраене и балансиран подбор. Обясни защо избираш тези настройки и създай изпита.'),('Пета и шеста минута','Отговори на няколко въпроса. Покажи таймера и навигацията. Изчакай потвърждението за запис, след което предай теста.'),('Седма и осма минута','Покажи резултата и обяснение към един въпрос. Отвори историята и анализа. Кажи как потребителят разбира какво да упражнява.'),('Последна минута','Върни се към слайд 17 и завърши. Остави сайта готов, ако поискат допълнително действие.')]
for label,body in demo:labelled(label,body)
labelled('Съкратен вариант','Покажи банката, генерирай тест, отговори на един въпрос, предай и отвори резултата. Пропусни подробното разглеждане на настройките.')
labelled('Ако сайтът не отговори','Кажи спокойно „В момента има технически проблем. Ще покажа същия процес чрез подготвените екрани“. Използвай слайдове 5, 6 и 7 и не твърди, че показваш действие на живо.')

newpage('Въпроси за приложението и сигурността')
for i,(q,a) in enumerate(data['faq'][:6],1):
    doc.add_heading(str(i)+' '+q,2);p(a)
newpage('Въпроси за алгоритмите и развитието')
for i,(q,a) in enumerate(data['faq'][6:],7):
    doc.add_heading(str(i)+' '+q,2);p(a)

newpage('Кратък речник и последна репетиция')
table=doc.add_table(rows=1,cols=2);table.alignment=WD_TABLE_ALIGNMENT.CENTER
table.autofit=False;table.columns[0].width=Cm(4.1);table.columns[1].width=Cm(12.5)
table.rows[0].cells[0].text='Термин';table.rows[0].cells[1].text='Обяснение с прости думи'
for term,meaning in data['terms']:
    cells=table.add_row().cells;cells[0].text=term;cells[1].text=meaning
for ri,row in enumerate(table.rows):
    for ci,cell in enumerate(row.cells):
        cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        tcPr=cell._tc.get_or_add_tcPr()
        shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E7E6E6' if ri==0 else ('FFFFFF' if ri%2 else 'F5F5F5'));tcPr.append(shade)
        borders=OxmlElement('w:tcBorders')
        for edge in ['top','left','bottom','right']:
            el=OxmlElement('w:'+edge);el.set(qn('w:val'),'single');el.set(qn('w:sz'),'4');el.set(qn('w:color'),'D9D9D9');borders.append(el)
        tcPr.append(borders)
        margins=OxmlElement('w:tcMar')
        for edge in ['top','left','bottom','right']:
            el=OxmlElement('w:'+edge);el.set(qn('w:w'),'90');el.set(qn('w:type'),'dxa');margins.append(el)
        tcPr.append(margins)
        for para in cell.paragraphs:
            para.paragraph_format.space_after=Pt(2);para.paragraph_format.space_before=Pt(2)
            for run in para.runs:run.font.size=Pt(11);run.bold=ri==0
header=OxmlElement('w:tblHeader');table.rows[0]._tr.get_or_add_trPr().append(header)
doc.add_heading('Провери дали можеш да обясниш',2)
for v in ['Какво прави ExamForge в едно изречение.','Защо автоматично генериран тест не означава автоматично написани въпроси.','Каква е разликата между случаен и балансиран подбор.','Защо сървърът пази верните отговори и проверява крайния срок.','Защо старият изпит пази собствено копие на въпросите.','Какво си разработил лично и кои готови технологии си използвал.']:
    doc.add_paragraph(v,'List Bullet')
doc.add_heading('Когато не знаеш отговора',2)
p('Не измисляй. Кажи какво знаеш и очертай границата: „В текущата версия съм реализирал това по този начин. За тази възможност ще е необходима допълнителна проверка“. Ако въпросът не е ясен, помоли да го уточнят.')
p('Основа на ръководството: актуалната презентация ExamForge с 17 слайда и техническата документация на проекта за архитектурата, базата данни и алгоритмите.',size=10)
out.parent.mkdir(parents=True,exist_ok=True);doc.save(out)
print(json.dumps({'path':str(out),'paragraphs':len(doc.paragraphs),'slides':len(data['slides']),'words':sum(len(p.text.split()) for p in doc.paragraphs)},ensure_ascii=False))
