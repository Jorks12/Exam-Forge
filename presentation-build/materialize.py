import os,sys,runpy,shutil
def copy_replace(src,dst):
    shutil.copyfile(src,dst)
os.replace=copy_replace
os.rename=copy_replace
def copy_link(src,dst,*args,**kwargs):
    with open(src,'rb') as incoming, open(dst,'xb') as outgoing:
        shutil.copyfileobj(incoming,outgoing)
os.link=copy_link
runpy.run_path(r'C:\Users\Zenbook\.codex\plugins\cache\openai-primary-runtime\presentations\26.1117.11355\skills\presentations\container_tools\materialize_literal_chart_workbooks.py',run_name='__main__')
